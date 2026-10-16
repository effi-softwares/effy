package com.effyshopping.driver.mobile.features.delivery.data

import com.effyshopping.driver.mobile.core.opening.toOpening
import com.effyshopping.driver.mobile.core.platform.imageContentType
import com.effyshopping.driver.mobile.features.delivery.domain.DeliveryWindow
import com.effyshopping.driver.mobile.contract.HandoverPreference
import com.effyshopping.driver.mobile.contract.DeliveryDropDTO
import com.effyshopping.driver.mobile.contract.DeliveryDropStatus
import com.effyshopping.driver.mobile.contract.DeliveryFailureReason
import com.effyshopping.driver.mobile.contract.DeliveryRunDTO
import com.effyshopping.driver.mobile.contract.DropFailRequest
import com.effyshopping.driver.mobile.contract.DropStatusRequest
import com.effyshopping.driver.mobile.contract.ProofMethod as DtoProofMethod
import com.effyshopping.driver.mobile.contract.ProofRequest
import com.effyshopping.driver.mobile.contract.ProofPresignRequest
import com.effyshopping.driver.mobile.contract.ProofPresignResponse
import com.effyshopping.driver.mobile.contract.To
import com.effyshopping.driver.mobile.core.error.AppError
import com.effyshopping.driver.mobile.core.error.AppException
import com.effyshopping.driver.mobile.core.http.ensureSuccess
import com.effyshopping.driver.mobile.core.platform.uploadBytes
import com.effyshopping.driver.mobile.features.manifest.data.toDomain
import com.effyshopping.driver.mobile.features.delivery.domain.Handover
import com.effyshopping.driver.mobile.features.delivery.domain.ProofMethod
import com.effyshopping.driver.mobile.core.offline.LastRead
import com.effyshopping.driver.mobile.core.offline.OfflineQueue
import com.effyshopping.driver.mobile.core.offline.PendingAction
import com.effyshopping.driver.mobile.core.offline.PendingProof
import com.effyshopping.driver.mobile.core.offline.ProofOutbox
import com.effyshopping.driver.mobile.core.offline.WriteOutcome
import com.effyshopping.driver.mobile.core.offline.withReplay
import kotlinx.serialization.json.Json
import com.effyshopping.driver.mobile.features.delivery.domain.DeliveryRepository
import com.effyshopping.driver.mobile.features.delivery.domain.DeliveryRun
import com.effyshopping.driver.mobile.features.delivery.domain.Drop
import com.effyshopping.driver.mobile.features.delivery.domain.DropPackage
import com.effyshopping.driver.mobile.features.delivery.domain.DropStatus
import com.effyshopping.driver.mobile.features.delivery.domain.DropSummary
import com.effyshopping.driver.mobile.features.delivery.domain.FailureReason
import io.ktor.client.HttpClient
import io.ktor.client.call.body
import io.ktor.client.request.get
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.util.network.UnresolvedAddressException
import kotlinx.coroutines.CancellationException
import kotlinx.io.IOException

class HttpDeliveryRepository(
    private val api: HttpClient,
    private val offline: OfflineQueue,
    /** Proof captured with no signal, waiting to be sent (backlog B3). */
    private val proofs: ProofOutbox,
    private val json: Json = Json { encodeDefaults = true },
    /** Told when a proof image did not reach storage, with a bounded reason — never the image. */
    private val onProofUploadFailed: (reason: String) -> Unit = {},
) : DeliveryRepository {

    override suspend fun getRun(runId: String): DeliveryRun = request {
        api.get("driver/v1/delivery/runs/$runId").ensureSuccess().body<DeliveryRunDTO>().toDomain()
    }.let { run ->
        // A drop whose proof is waiting on the phone is delivered as far as the driver is concerned.
        run.copy(drops = run.drops.map { if (proofs.isPending(it.dropId)) it.copy(status = DropStatus.DELIVERED) else it })
    }

    /** 065 FR-024 — a drop the driver has already seen stays readable with no connection. */
    private val lastDrops = LastRead<String, Drop> { it.copy(stale = true) }

    override suspend fun getDrop(dropId: String): Drop = lastDrops.fetch(dropId) {
        request {
            api.get("driver/v1/delivery/drops/$dropId").ensureSuccess().body<DeliveryDropDTO>().toDomain()
        }
    }.let { if (proofs.isPending(dropId)) it.copy(status = DropStatus.DELIVERED) else it }

    override suspend fun advance(dropId: String, to: String, changeId: String): WriteOutcome {
        val toEnum = when (to) {
            "out_for_delivery" -> To.OutForDelivery
            "en_route" -> To.EnRoute
            else -> To.Arrived
        }
        val path = "driver/v1/delivery/drops/$dropId/status"
        val body = DropStatusRequest(changeID = changeId, to = toEnum)
        return request {
            offline.withReplay(path, json.encodeToString(DropStatusRequest.serializer(), body), changeId, "Advance a drop", queued = { WriteOutcome.QUEUED }) {
                api.post(path) { setBody(body) }.ensureSuccess()
                WriteOutcome.SENT
            }
        }
    }

    /**
     * Presign → upload → submit (064). ⚠ WITH NO SIGNAL THE PROOF IS KEPT, NOT LOST (backlog B3): the
     * image is saved on the phone and sent by [flushProofs] under the same changeId, and the drop
     * reads as delivered here meanwhile. It used to be a dead end at a doorstep with no signal.
     */
    override suspend fun completeWithMedia(dropId: String, method: ProofMethod, bytes: ByteArray, note: String?, changeId: String): WriteOutcome =
        try {
            sendProof(dropId, method, bytes, note, changeId)
            WriteOutcome.SENT
        } catch (e: AppException) {
            if (e.error != AppError.Network) throw e
            proofs.add(PendingProof(changeId, dropId, method.name.lowercase(), note), bytes)
            WriteOutcome.QUEUED
        }

    /**
     * Send every proof waiting on the phone, oldest first. Stops at the first sign the connection is
     * still down; a proof the platform refuses is dropped and reported in the "Not recorded" banner.
     */
    suspend fun flushProofs() {
        for (p in proofs.pending.value) {
            val bytes = proofs.bytes(p.changeId)
            val method = ProofMethod.entries.firstOrNull { it.name.equals(p.method, ignoreCase = true) }
            if (bytes == null || method == null) {
                proofs.remove(p.changeId)
                offline.recordRefused(PendingAction(p.changeId, "driver/v1/delivery/drops/${p.dropId}/proof", "", PROOF_LABEL))
                continue
            }
            try {
                sendProof(p.dropId, method, bytes, p.note, p.changeId)
                proofs.remove(p.changeId)
            } catch (e: AppException) {
                when (e.error) {
                    AppError.Network, AppError.Unavailable, AppError.Unauthenticated,
                    is AppError.NotOpenYet, is AppError.RateLimited -> return
                    AppError.Unexpected -> {
                        proofs.bumpAttempts(p.changeId)
                        if (p.attempts + 1 < MAX_PROOF_ATTEMPTS) return
                        proofs.remove(p.changeId)
                        offline.recordRefused(PendingAction(p.changeId, "driver/v1/delivery/drops/${p.dropId}/proof", "", PROOF_LABEL))
                    }
                    else -> {
                        proofs.remove(p.changeId)
                        offline.recordRefused(PendingAction(p.changeId, "driver/v1/delivery/drops/${p.dropId}/proof", "", PROOF_LABEL))
                    }
                }
            }
        }
    }

    private suspend fun sendProof(dropId: String, method: ProofMethod, bytes: ByteArray, note: String?, changeId: String) {
        // A photo is JPEG; a drawn signature is PNG. The bytes say which.
        val contentType = imageContentType(bytes)
        val presign = request {
            api.post("driver/v1/delivery/drops/$dropId/proof/presign") {
                setBody(ProofPresignRequest(changeID = changeId, contentType = contentType, fileSize = bytes.size.toLong()))
            }.ensureSuccess().body<ProofPresignResponse>()
        }
        val uploaded = uploadBytes(presign.uploadURL, bytes, contentType)
        // ⚠ FR-006 — the drop is NOT completed if the image did not land. The submission below carries
        // a key to something already stored, so a delivery can never be marked against proof that
        // failed to upload. A failed upload is treated as no signal: the proof waits in the outbox.
        if (!uploaded) {
            onProofUploadFailed("upload_rejected")
            throw AppException(AppError.Network)
        }

        // ⚠ THIS WAS `if (method == PHOTO) Photo else Signature`, AND IT WAS A LATENT DEFECT. Any
        // method that was not PHOTO became a SIGNATURE — harmless while only two methods reached
        // here, and silently wrong the moment CONTACTLESS did (064 routes it through this path, since
        // an unattended drop must be photographed). The backend would have ACCEPTED it: signature +
        // mediaKey is a valid proof. Every "left at the door" would have been recorded as a customer
        // signature, with nothing failing anywhere. An exhaustive `when` makes the next method a
        // compile error instead.
        val dtoMethod = when (method) {
            ProofMethod.PHOTO -> DtoProofMethod.Photo
            ProofMethod.SIGNATURE -> DtoProofMethod.Signature
            ProofMethod.CONTACTLESS -> DtoProofMethod.Contactless
        }
        request {
            api.post("driver/v1/delivery/drops/$dropId/proof") {
                setBody(ProofRequest(changeID = changeId, method = dtoMethod, mediaKey = presign.mediaKey, note = note))
            }.ensureSuccess()
        }
    }

    override suspend fun fail(dropId: String, reason: FailureReason, note: String?, changeId: String): WriteOutcome {
        val path = "driver/v1/delivery/drops/$dropId/fail"
        val body = DropFailRequest(changeID = changeId, reason = failureReason(reason), note = note)
        return request {
            offline.withReplay(path, json.encodeToString(DropFailRequest.serializer(), body), changeId, "Mark a drop undeliverable", queued = { WriteOutcome.QUEUED }) {
                api.post(path) { setBody(body) }.ensureSuccess()
                WriteOutcome.SENT
            }
        }
    }

    private suspend inline fun <T> request(block: () -> T): T =
        try {
            block()
        } catch (e: CancellationException) {
            throw e
        } catch (e: AppException) {
            throw e
        } catch (e: IOException) {
            throw AppException(AppError.Network)
        } catch (e: UnresolvedAddressException) {
            throw AppException(AppError.Network)
        } catch (e: Throwable) {
            throw AppException(AppError.Unexpected)
        }
}


private const val PROOF_LABEL = "Proof of delivery"
private const val MAX_PROOF_ATTEMPTS = 5

private fun dropStatus(s: DeliveryDropStatus): DropStatus = when (s) {
    DeliveryDropStatus.Staged -> DropStatus.STAGED
    DeliveryDropStatus.OutForDelivery -> DropStatus.OUT_FOR_DELIVERY
    DeliveryDropStatus.EnRoute -> DropStatus.EN_ROUTE
    DeliveryDropStatus.Arrived -> DropStatus.ARRIVED
    DeliveryDropStatus.Delivered -> DropStatus.DELIVERED
    DeliveryDropStatus.Failed -> DropStatus.FAILED
}

private fun failureReason(r: FailureReason): DeliveryFailureReason = when (r) {
    FailureReason.NOBODY_HOME -> DeliveryFailureReason.NobodyHome
    FailureReason.WRONG_ADDRESS -> DeliveryFailureReason.WrongAddress
    FailureReason.CUSTOMER_REFUSED -> DeliveryFailureReason.CustomerRefused
    FailureReason.ACCESS_BLOCKED -> DeliveryFailureReason.AccessBlocked
    FailureReason.OTHER -> DeliveryFailureReason.Other
}

private fun DeliveryRunDTO.toDomain() = DeliveryRun(
    runId = runID,
    status = status,
    drops = drops.map {
        DropSummary(
            it.dropID, it.sequence.toInt(), it.orderRef, it.customerSuburb, it.packageCount.toInt(), dropStatus(it.status), it.summary.toDomain(),
            // 069 — ⚠ `window` (the label) existed on this DTO since 049 and was never mapped, because
            // it was always null. It is real now, and so are the instants beside it.
            window = DeliveryWindow.of(it.window, it.deliveryWindow?.startAt, it.deliveryWindow?.endAt),
        )
    },
    opening = opening.toOpening(),
    dueLabel = dueLabel,
)

private fun DeliveryDropDTO.toDomain() = Drop(
    dropId = dropID,
    orderRef = orderRef,
    customerName = customerName,
    addressFull = addressFull,
    instructions = instructions,
    packages = packages.map { p -> DropPackage(p.ref, p.fromShopCount.toInt(), p.items.map { it.toDomain() }, p.summary.toDomain()) },
    status = dropStatus(status),
    summary = summary.toDomain(),
    // 066 — exhaustive on purpose: a third preference on the wire must fail to compile here.
    handover = when (handover) {
        HandoverPreference.LeaveAtDoor -> Handover.LeaveAtDoor
        HandoverPreference.MeetAtDoor -> Handover.MeetAtDoor
        null -> null
    },
    window = DeliveryWindow.of(window, deliveryWindow?.startAt, deliveryWindow?.endAt),
    opening = opening.toOpening(),
)
