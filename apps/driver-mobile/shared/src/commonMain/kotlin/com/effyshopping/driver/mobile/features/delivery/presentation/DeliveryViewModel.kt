package com.effyshopping.driver.mobile.features.delivery.presentation

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.effyshopping.driver.mobile.core.error.AppException
import com.effyshopping.driver.mobile.core.error.isFinal
import com.effyshopping.driver.mobile.core.offline.ActionIds
import com.effyshopping.driver.mobile.core.offline.WriteOutcome
import com.effyshopping.driver.mobile.core.presentation.userMessage
import com.effyshopping.driver.mobile.features.delivery.domain.AdvanceDrop
import com.effyshopping.driver.mobile.features.delivery.domain.CompleteWithMedia
import com.effyshopping.driver.mobile.features.delivery.domain.ProofMethod
import com.effyshopping.driver.mobile.features.delivery.domain.DeliveryRun
import com.effyshopping.driver.mobile.features.delivery.domain.Drop
import com.effyshopping.driver.mobile.features.delivery.domain.DropStatus
import com.effyshopping.driver.mobile.features.delivery.domain.FailDrop
import com.effyshopping.driver.mobile.features.delivery.domain.FailureReason
import com.effyshopping.driver.mobile.features.delivery.domain.GetDeliveryRun
import com.effyshopping.driver.mobile.features.delivery.domain.GetDrop
import com.effyshopping.driver.mobile.features.delivery.domain.LoadVan
import com.effyshopping.driver.mobile.features.delivery.domain.ReturnToHub
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.emptyFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/**
 * Where a contactless package was left (060 FR-023).
 *
 * ⚠ Replaces free text, and that is a correctness change rather than styling: a typed answer
 * cannot be matched against a customer's later claim, and at a doorstep it mostly is not typed at
 * all. Serialised into the existing note field, so no contract changes.
 */
enum class DropSpot(val label: String) {
    FRONT_DOOR("Front door"),
    RECEPTION("Reception / lobby"),
    MAILROOM("Mailroom"),
    NEIGHBOUR("With a neighbour"),
}

data class DeliveryUiState(
    val run: DeliveryRun? = null,
    val drop: Drop? = null,
    val delivered: Boolean = false,
    val failed: Boolean = false,
    val isLoading: Boolean = false,
    val isWorking: Boolean = false,
    val message: String? = null,
    /**
     * A note attached to the proof (060 FR-022).
     *
     * ⚠ The repository has ALWAYS accepted a note on every proof method — and every call site in
     * the app passed `null`. This is a UI gap being closed, not a contract change.
     */
    val proofNote: String = "",
    /** A note attached to an undeliverable report (060 FR-022). Same story: the parameter existed. */
    val failNote: String = "",
    /** The chosen drop location for contactless proof (060 FR-023). */
    val dropSpot: DropSpot? = null,
    /** Delivered with no signal: the proof is saved on the phone and sends when it can (backlog B3). */
    val proofSending: Boolean = false,
    /** 092 — how the last drop was completed, for the Delivered screen; null until one is. */
    val deliveredWith: ProofMethod? = null,
    /** 092 — when it was completed, on this phone's clock. */
    val deliveredAtEpochMillis: Long? = null,
    /** 092 — a short confirmation for the snackbar ("Van loaded"); cleared once shown. */
    val notice: String? = null,
)

class DeliveryViewModel(
    private val runId: String,
    private val getRun: GetDeliveryRun,
    private val getDrop: GetDrop,
    private val advanceDrop: AdvanceDrop,
    private val completeWithMedia: CompleteWithMedia,
    private val failDrop: FailDrop,
    private val newChangeId: () -> String,
    /** 071 — "your work changed, or the channel just (re)connected: read now". Empty in tests. */
    private val liveChanges: Flow<Unit> = emptyFlow(),
    /** 088 — return the run's failed parcels to the hub. Null in tests that do not care. */
    private val returnToHub: ReturnToHub? = null,
    /** 090 — load the van: every staged drop goes out together. Null in tests that do not care. */
    private val loadVan: LoadVan? = null,
    private val now: () -> Long = { com.effyshopping.driver.mobile.core.presentation.nowEpochMillis() },
) : ViewModel() {
    private val _state = MutableStateFlow(DeliveryUiState())
    val state = _state.asStateFlow()

    private val ids = ActionIds(newChangeId)

    init {
        viewModelScope.launch { liveChanges.collect { reloadRunQuietly() } }
    }

    /**
     * A dispatcher changed this round (re-ordered its stops, moved it, withdrew it). Re-read the
     * round the driver is looking at, quietly.
     *
     * ⚠ NEVER WHILE THE DRIVER IS MID-ACTION (FR-016): a load or a submission of theirs is in
     * flight and its own answer is about to replace this state. And only once a round has loaded —
     * the first load is `loadRun`'s, with its own loading and error states.
     */
    private suspend fun reloadRunQuietly() {
        val now = _state.value
        if (now.run == null || now.isLoading || now.isWorking) return
        runCatching { getRun(runId) }.onSuccess { fresh ->
            _state.update { if (it.isLoading || it.isWorking) it else it.copy(run = fresh) }
        }
    }

    /**
     * A drop was just delivered or failed: read the round again so the count of drops left, and which
     * drop is next, do not still include it. Best-effort — the drop is closed whether or not this reads.
     */
    private suspend fun refreshRunAfterClose() {
        runCatching { getRun(runId) }.onSuccess { fresh -> _state.update { it.copy(run = fresh) } }
    }
    private fun markInRun(dropId: String, status: DropStatus) {
        _state.update { st ->
            st.copy(run = st.run?.let { run -> run.copy(drops = run.drops.map { if (it.dropId == dropId) it.copy(status = status) else it }) })
        }
    }

    /** The next drop still to do on this round after [dropId], in round order; null when none. */
    fun nextOpenDrop(dropId: String): String? =
        _state.value.run?.drops
            ?.filter { it.dropId != dropId && it.status != DropStatus.DELIVERED && it.status != DropStatus.FAILED }
            ?.minByOrNull { it.sequence }
            ?.dropId
    fun clearNotice() = _state.update { it.copy(notice = null) }

    fun loadRun() {
        _state.update { it.copy(isLoading = true, message = null) }
        viewModelScope.launch {
            try {
                _state.update { it.copy(run = getRun(runId), isLoading = false) }
            } catch (e: AppException) {
                _state.update { it.copy(isLoading = false, message = e.error.userMessage()) }
            }
        }
    }

    fun loadDrop(dropId: String) {
        _state.update {
            it.copy(
                isLoading = true, drop = null, delivered = false, failed = false, proofSending = false, message = null,
                deliveredWith = null, deliveredAtEpochMillis = null,
            )
        }
        viewModelScope.launch {
            try {
                _state.update { it.copy(drop = getDrop(dropId), isLoading = false) }
            } catch (e: AppException) {
                _state.update { it.copy(isLoading = false, message = e.error.userMessage()) }
            }
        }
    }

    fun advance(dropId: String, to: String) {
        if (_state.value.isWorking) return
        _state.update { it.copy(isWorking = true, message = null) }
        val action = "advance:$dropId:$to"
        viewModelScope.launch {
            try {
                val outcome = advanceDrop(dropId, to, ids.of(action))
                ids.settled(action)
                if (outcome == WriteOutcome.SENT) {
                    _state.update { it.copy(isWorking = false) }
                    loadDrop(dropId)
                } else {
                    // Saved to send (backlog C1): move the driver on now. A re-read would answer with
                    // the last copy, from before this step.
                    val next = dropStatusFor(to)
                    _state.update { st ->
                        st.copy(isWorking = false, drop = st.drop?.takeIf { it.dropId == dropId }?.copy(status = next) ?: st.drop)
                    }
                }
            } catch (e: AppException) {
                if (e.error.isFinal()) ids.settled(action)
                _state.update { it.copy(isWorking = false, message = e.error.userMessage()) }
            }
        }
    }

    /**
     * Complete an unattended drop.
     *
     * ⚠ IT TAKES BYTES NOW (064, FR-002). Leaving a package with no evidence of where it was left is
     * the case most likely to become a dispute, so contactless carries a photograph like every other
     * proof — the METHOD is what records that nobody took it in hand. The backend refuses a
     * contactless proof with no media, so a no-photo path here would simply 422 at the doorstep.
     */
    fun deliverContactless(dropId: String, bytes: ByteArray, note: String?) = deliver(dropId, ProofMethod.CONTACTLESS, bytes, note)

    fun deliverWithPhoto(dropId: String, bytes: ByteArray, note: String?) = deliver(dropId, ProofMethod.PHOTO, bytes, note)

    fun deliverWithSignature(dropId: String, bytes: ByteArray, note: String?) = deliver(dropId, ProofMethod.SIGNATURE, bytes, note)

    /**
     * Complete a drop — the second of its two taps (092, R5). ⚠ ARRIVAL IS RECORDED HERE, SILENTLY,
     * before the proof: the driver no longer says "On my way" or "I've arrived", but the platform's
     * timeline still has an arrival, written in the same order (both saved and sent in order with no
     * signal). A drop already arrived is not moved again.
     *
     * One changeId per drop's proof, whichever method — a retry of the same delivery is one write.
     */
    fun deliver(dropId: String, method: ProofMethod, bytes: ByteArray, note: String?, handed: List<com.effyshopping.driver.mobile.core.scan.HandedOver> = emptyList()) {
        if (_state.value.isWorking) return
        _state.update { it.copy(isWorking = true, message = null) }
        val arrive = "advance:$dropId:arrived"
        val action = "proof:$dropId"
        viewModelScope.launch {
            try {
                val status = _state.value.drop?.takeIf { it.dropId == dropId }?.status
                if (status == null || status == DropStatus.STAGED || status == DropStatus.OUT_FOR_DELIVERY || status == DropStatus.EN_ROUTE) {
                    advanceDrop(dropId, "arrived", ids.of(arrive))
                    ids.settled(arrive)
                }
                val outcome = completeWithMedia(dropId, method, bytes, note, ids.of(action), handed)
                ids.settled(action)
                // Saved with no signal, the re-read cannot reach the platform; the run's copy is
                // corrected here so the count of drops left is right.
                if (outcome == WriteOutcome.QUEUED) markInRun(dropId, DropStatus.DELIVERED) else refreshRunAfterClose()
                _state.update {
                    it.copy(
                        isWorking = false, delivered = true, proofSending = outcome == WriteOutcome.QUEUED,
                        deliveredWith = method, deliveredAtEpochMillis = now(),
                    )
                }
            } catch (e: AppException) {
                if (e.error.isFinal()) {
                    ids.settled(arrive)
                    ids.settled(action)
                }
                _state.update { it.copy(isWorking = false, message = e.error.userMessage()) }
            }
        }
    }

    /**
     * 090 — the van is loaded: every staged drop goes out for delivery in one step (replaces "Start
     * this drop"). Saved with no signal, the run's copy is moved on here so the driver can start.
     */
    fun loadVan(handed: List<com.effyshopping.driver.mobile.core.scan.HandedOver> = emptyList()) {
        val send = loadVan ?: return
        if (_state.value.isWorking) return
        _state.update { it.copy(isWorking = true, message = null) }
        val action = "load:$runId"
        viewModelScope.launch {
            try {
                val outcome = send(runId, ids.of(action), handed)
                ids.settled(action)
                _state.update { st ->
                    st.copy(
                        isWorking = false,
                        notice = "Van loaded · every drop is out for delivery",
                        run = st.run?.let { run ->
                            run.copy(drops = run.drops.map { if (it.status == DropStatus.STAGED) it.copy(status = DropStatus.OUT_FOR_DELIVERY) else it })
                        },
                    )
                }
                if (outcome == WriteOutcome.SENT) refreshRunAfterClose()
            } catch (e: AppException) {
                if (e.error.isFinal()) ids.settled(action)
                _state.update { it.copy(isWorking = false, message = e.error.userMessage()) }
            }
        }
    }

    /** 088 — the parcels from this run's failed drops are back at the hub: return them all at once. */
    fun returnParcels(handed: List<com.effyshopping.driver.mobile.core.scan.HandedOver> = emptyList()) {
        val send = returnToHub ?: return
        if (_state.value.isWorking || _state.value.run?.toReturn == null) return
        _state.update { it.copy(isWorking = true, message = null) }
        val action = "return:$runId"
        viewModelScope.launch {
            try {
                val outcome = send(runId, ids.of(action), handed)
                ids.settled(action)
                _state.update { it.copy(isWorking = false, run = it.run?.copy(toReturn = null), notice = "Parcels checked in at the hub") }
                if (outcome == WriteOutcome.SENT) refreshRunAfterClose()
            } catch (e: AppException) {
                if (e.error.isFinal()) ids.settled(action)
                _state.update { it.copy(isWorking = false, message = e.error.userMessage()) }
            }
        }
    }

    fun fail(dropId: String, reason: FailureReason, note: String?) {
        if (_state.value.isWorking) return
        _state.update { it.copy(isWorking = true, message = null) }
        val action = "fail:$dropId"
        viewModelScope.launch {
            try {
                val outcome = failDrop(dropId, reason, note, ids.of(action))
                ids.settled(action)
                if (outcome == WriteOutcome.SENT) {
                    refreshRunAfterClose()
                } else {
                    // Saved to send: the run's copy would still show this drop open.
                    markInRun(dropId, DropStatus.FAILED)
                }
                _state.update { it.copy(isWorking = false, failed = true) }
            } catch (e: AppException) {
                if (e.error.isFinal()) ids.settled(action)
                _state.update { it.copy(isWorking = false, message = e.error.userMessage()) }
            }
        }
    }
}

/** The status a drop is in once [to] (the wire's step name) has been applied. */
private fun dropStatusFor(to: String): DropStatus = when (to) {
    "out_for_delivery" -> DropStatus.OUT_FOR_DELIVERY
    "en_route" -> DropStatus.EN_ROUTE
    else -> DropStatus.ARRIVED
}
