package com.effyshopping.driver.mobile.features.delivery.data

import com.effyshopping.driver.mobile.core.scan.toDomain
import com.effyshopping.driver.mobile.core.scan.toWire
import com.effyshopping.driver.mobile.core.scan.toWireMissing
import com.effyshopping.driver.mobile.core.opening.toOpening
import com.effyshopping.driver.mobile.core.platform.imageContentType
import com.effyshopping.driver.mobile.features.delivery.domain.DeliveryWindow
import com.effyshopping.driver.mobile.contract.HandoverPreference
import com.effyshopping.driver.mobile.contract.DeliveryDropDTO
import com.effyshopping.driver.mobile.contract.DeliveryDropStatus
import com.effyshopping.driver.mobile.contract.DeliveryFailureReason
import com.effyshopping.driver.mobile.contract.DeliveryRunDTO
import com.effyshopping.driver.mobile.contract.DropFailRequest
import com.effyshopping.driver.mobile.contract.ParcelReturnRequest
import com.effyshopping.driver.mobile.contract.LoadRequest
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
import com.effyshopping.driver.mobile.features.delivery.domain.ParcelsToReturn
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
import com.effyshopping.driver.mobile.features.delivery.domain.MissingReason
import com.effyshopping.driver.mobile.features.delivery.domain.NotLoaded
import io.ktor.client.HttpClient
import io.ktor.client.call.body
import io.ktor.client.request.get
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.util.network.UnresolvedAddressException
import kotlinx.coroutines.CancellationException
import kotlinx.io.IOException
import com.effyshopping.driver.mobile.core.map.toDomain
import com.effyshopping.driver.mobile.features.delivery.domain.ReturnParcel

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

    /** A drop the driver has already seen stays readable with no connection. */
    private val lastDrops = LastRead<String, Drop> { it.copy(stale = true) }

    override suspend fun getDrop(dropId: String): Drop = lastDrops.fetch(dropId) {
        request {
            api.get("driver/v1/delivery/drops/$dropId").ensureSuccess().body<DeliveryDropDTO>().toDomain()
        }
    }.let { if (proofs.isPending(dropId)) it.copy(status = DropStatus.DELIVERED) else it }

    override suspend fun advance(dropId: String, to: String, changeId: String): WriteOutcome {
        // Out for delivery is the van being loaded ([load]); a drop is only moved on from there.
        val toEnum = when (to) {
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
     * Presign → upload → submit. With no signal the proof is kept, not lost (backlog B3): the
     * image is saved on the phone and sent by [flushProofs] under the same changeId, and the drop
     * reads as delivered here meanwhile. It used to be a dead end at a doorstep with no signal.
     */
    override suspend fun completeWithMedia(dropId: String, method: ProofMethod, bytes: ByteArray, note: String?, changeId: String, handed: List<com.effyshopping.driver.mobile.core.scan.HandedOver>): WriteOutcome =
        try {
            sendProof(dropId, method, bytes, note, changeId, handed)
            WriteOutcome.SENT
        } catch (e: AppException) {
            if (e.error != AppError.Network) throw e
            proofs.add(PendingProof(changeId, dropId, method.name.lowercase(), note, handed = handed), bytes)
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
                sendProof(p.dropId, method, bytes, p.note, p.changeId, p.handed)
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

    private suspend fun sendProof(dropId: String, method: ProofMethod, bytes: ByteArray, note: String?, changeId: String, handed: List<com.effyshopping.driver.mobile.core.scan.HandedOver>) {
        // A photo is JPEG; a drawn signature is PNG. The bytes say which.
        val contentType = imageContentType(bytes)
        val presign = request {
            api.post("driver/v1/delivery/drops/$dropId/proof/presign") {
                setBody(ProofPresignRequest(changeID = changeId, contentType = contentType, fileSize = bytes.size.toLong()))
            }.ensureSuccess().body<ProofPresignResponse>()
        }
        val uploaded = uploadBytes(presign.uploadURL, bytes, contentType)
        // The drop is not completed if the image did not land. The submission below carries
        // a key to something already stored, so a delivery can never be marked against proof that
        // failed to upload. A failed upload is treated as no signal: the proof waits in the outbox.
        if (!uploaded) {
            onProofUploadFailed("upload_rejected")
            throw AppException(AppError.Network)
        }

        // Exhaustive, so a new method is a compile error rather than silently recorded as a signature.
        val dtoMethod = when (method) {
            ProofMethod.PHOTO -> DtoProofMethod.Photo
            ProofMethod.SIGNATURE -> DtoProofMethod.Signature
            ProofMethod.CONTACTLESS -> DtoProofMethod.Contactless
        }
        request {
            api.post("driver/v1/delivery/drops/$dropId/proof") {
                setBody(ProofRequest(changeID = changeId, method = dtoMethod, mediaKey = presign.mediaKey, note = note, parcels = handed.toWire(), reads = com.effyshopping.driver.mobile.core.scan.ReadLog.drain()))
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

    /** Saved and sent later with no signal, like every other driver write. */
    override suspend fun returnToHub(runId: String, changeId: String, handed: List<com.effyshopping.driver.mobile.core.scan.HandedOver>): WriteOutcome {
        val path = "driver/v1/delivery/runs/$runId/return"
        val body = ParcelReturnRequest(changeID = changeId, parcels = handed.toWire(), reads = com.effyshopping.driver.mobile.core.scan.ReadLog.drain())
        return request {
            offline.withReplay(path, json.encodeToString(ParcelReturnRequest.serializer(), body), changeId, "Return parcels to the hub", queued = { WriteOutcome.QUEUED }) {
                api.post(path) { setBody(body) }.ensureSuccess()
                WriteOutcome.SENT
            }
        }
    }

    /** Saved and sent later with no signal, like every other driver write. */
    override suspend fun load(runId: String, changeId: String, handed: List<com.effyshopping.driver.mobile.core.scan.HandedOver>, notLoaded: List<NotLoaded>): WriteOutcome {
        val path = "driver/v1/delivery/runs/$runId/load"
        // Every bag on the run: loaded (and how), or declared not loaded with a reason.
        val body = LoadRequest(
            changeID = changeId,
            parcels = handed.toWire(),
            missingParcels = notLoaded.map { com.effyshopping.driver.mobile.core.scan.MissingBag(it.code, it.reason.wire, it.note) }.toWireMissing(),
            reads = com.effyshopping.driver.mobile.core.scan.ReadLog.drain(),
        )
        return request {
            offline.withReplay(path, json.encodeToString(LoadRequest.serializer(), body), changeId, "Load the van", queued = { WriteOutcome.QUEUED }) {
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
            // `window` (the label) existed on this DTO since 049 and was never mapped, because
            // it was always null. It is real now, and so are the instants beside it.
            window = DeliveryWindow.of(it.window, it.deliveryWindow?.startAt, it.deliveryWindow?.endAt),
            bags = it.parcels.map { b -> b.toDomain() },
            street = it.street?.takeIf { s -> s.isNotBlank() },
            completedAtIso = it.completedAt,
            proofMethod = it.proofMethod?.toDomain(),
            failureReason = it.failureReason?.toDomain(),
        )
    },
    opening = opening.toOpening(),
    dueLabel = dueLabel,
    toReturn = toReturn?.toParcels(),
    map = map?.toDomain(),
    stageLabel = stageLabel?.takeIf { it.isNotBlank() },
)

/** 088/092 — the wire's parcels to return → the domain's. Shared with Today's read. */
internal fun com.effyshopping.driver.mobile.contract.ParcelsToReturn.toParcels() = ParcelsToReturn(
    runID, count.toInt(), orders,
    parcels = parcels.map { ReturnParcel(it.ref, it.packageCode, it.place?.takeIf { p -> p.isNotBlank() }, it.reason?.toDomain(), bags = it.parcels.map { b -> b.toDomain() }) },
)

internal fun DeliveryFailureReason.toDomain(): FailureReason = when (this) {
    DeliveryFailureReason.NobodyHome -> FailureReason.NOBODY_HOME
    DeliveryFailureReason.WrongAddress -> FailureReason.WRONG_ADDRESS
    DeliveryFailureReason.CustomerRefused -> FailureReason.CUSTOMER_REFUSED
    DeliveryFailureReason.AccessBlocked -> FailureReason.ACCESS_BLOCKED
    DeliveryFailureReason.Other -> FailureReason.OTHER
}

/** A code proof does not exist on this platform; it reads as no method. */
internal fun DtoProofMethod.toDomain(): ProofMethod? = when (this) {
    DtoProofMethod.Photo -> ProofMethod.PHOTO
    DtoProofMethod.Signature -> ProofMethod.SIGNATURE
    DtoProofMethod.Contactless -> ProofMethod.CONTACTLESS
    DtoProofMethod.Code -> null
}

private fun DeliveryDropDTO.toDomain() = Drop(
    dropId = dropID,
    orderRef = orderRef,
    customerName = customerName,
    addressFull = addressFull,
    instructions = instructions,
    packages = packages.map { p -> DropPackage(p.ref, p.fromShopCount.toInt(), p.items.map { it.toDomain() }, p.summary.toDomain(), p.packageCode, bags = p.parcels.map { b -> b.toDomain() }) },
    status = dropStatus(status),
    summary = summary.toDomain(),
    // Exhaustive on purpose: a third preference on the wire must fail to compile here.
    handover = when (handover) {
        HandoverPreference.LeaveAtDoor -> Handover.LeaveAtDoor
        HandoverPreference.MeetAtDoor -> Handover.MeetAtDoor
        null -> null
    },
    window = DeliveryWindow.of(window, deliveryWindow?.startAt, deliveryWindow?.endAt),
    opening = opening.toOpening(),
    customerPhone = customerPhone?.takeIf { it.isNotBlank() },
)
