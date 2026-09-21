// GENERATED FROM packages/shared-types/src/driver.ts (+ problem.ts) — DO NOT EDIT.
// Regenerate: pnpm --filter @effy/shared-types driver-contract:gen
// The wire contract lives in TypeScript ONCE (Principle II); this file is derived and diff-guarded.

package com.effyshopping.driver.mobile.contract

import kotlinx.serialization.*
import kotlinx.serialization.json.*
import kotlinx.serialization.descriptors.*
import kotlinx.serialization.encoding.*

@Serializable
data class ActivityItem (
    val body: String,
    val createdAt: String,

    @SerialName("dropId")
    val dropID: String? = null,

    val id: String,
    val read: Boolean,

    @SerialName("runId")
    val runID: String? = null,

    val type: ActivityType
)

@Serializable
enum class ActivityType(val value: String) {
    @SerialName("cutoff_missed") CutoffMissed("cutoff_missed"),
    @SerialName("issue_ack") IssueACK("issue_ack"),
    @SerialName("packages_ready") PackagesReady("packages_ready"),
    @SerialName("reminder") Reminder("reminder"),
    @SerialName("run_assigned") RunAssigned("run_assigned"),
    @SerialName("sameday_window") SamedayWindow("sameday_window");
}

/**
 * POST /driver/v1/activity/read
 */
@Serializable
data class ActivityReadRequest (
    val ids: List<String>
)

/**
 * POST /driver/v1/collection/runs/{runId}/stops/{stopId}/collect — collect this shop's
 * packages.
 */
@Serializable
data class CollectRequest (
    @SerialName("changeId")
    val changeID: String,

    /**
     * ⚠ ADDED BY 063, OPTIONAL BY DESIGN. Absent means what it has always meant: every package
     * at this stop was collected. Present, it records each package's own outcome IN THE SAME
     * REQUEST.
     *
     * That atomicity is the point (FR-026). With collect-all followed by a separate `/issue`
     * call there is a window in which the platform believes a package is in the van and it is
     * not — and if the second call never arrives (the driver walks out of signal, the app is
     * killed), the window never closes and nobody is told. One request cannot half-happen.
     *
     * ⚠ It is OPTIONAL rather than required so the existing client call remains valid and no
     * Kotlin call site changes. A required field here would have meant reworking the ViewModels
     * behind several of 060's screens to say something the old shape already said correctly.
     */
    val packages: List<Package>? = null
)

@Serializable
data class Package (
    val note: String? = null,
    val outcome: Outcome,

    @SerialName("packageId")
    val packageID: String
)

@Serializable
enum class Outcome(val value: String) {
    @SerialName("not_available") NotAvailable("not_available"),
    @SerialName("picked_up") PickedUp("picked_up");
}

@Serializable
data class CollectResponse (
    val status: CollectResponseStatus
)

@Serializable
enum class CollectResponseStatus(val value: String) {
    @SerialName("collected") Collected("collected");
}

/**
 * POST /driver/v1/collection/runs/{runId}/stops/{stopId}/issue — report a missing/short
 * package.
 */
@Serializable
data class CollectionIssueRequest (
    @SerialName("changeId")
    val changeID: String,

    val kind: CollectionIssueKind,
    val note: String? = null,

    @SerialName("shopFulfillmentId")
    val shopFulfillmentID: String? = null
)

@Serializable
enum class CollectionIssueKind(val value: String) {
    @SerialName("short") KindShort("short"),
    @SerialName("missing") Missing("missing");
}

@Serializable
data class CollectionPackage (
    val destinationSuburb: String,
    val items: List<ManifestLine>,
    val method: PackageMethod,
    val ref: String
)

@Serializable
data class ManifestLine (
    val name: String,
    val qty: Long
)

@Serializable
enum class PackageMethod(val value: String) {
    @SerialName("same_day") SameDay("same_day"),
    @SerialName("standard") Standard("standard");
}

/**
 * GET /driver/v1/collection/runs/{runId} (driver-facing; distinct from 047's admin
 * CollectionRunDTO)
 */
@Serializable
data class DriverCollectionRunDTO (
    @SerialName("runId")
    val runID: String,

    val status: String,
    val stops: List<CollectionStopSummary>
)

@Serializable
data class CollectionStopSummary (
    /**
     * ⚠ ADDED BY 063, AND IT RETIRES A PLACEHOLDER. `collection/data/PlaceholderData.kt`
     * declares `stopAddress = operational("`shop.address`")` — an invented value a driver could
     * act on, so the app renders it as unavailable. 061 built `shop.address_*`; this carries
     * it, and the unblocking condition that placeholder names is now met.
     *
     * ⚠ AN ADDRESS, NEVER A POSITION (D20/D21). The app hands this to the device's own maps app
     * (D7 — per stop, not per route). No coordinate exists to send.
     *
     * Nullable because a shop whose address has not been recorded yet is an ordinary state the
     * back-office readiness view already reports (061 FR-029/030) — and a driver must be told
     * the address is missing rather than shown an empty line.
     */
    val address: String? = null,

    val packageCount: Long,
    val sequence: Long,
    val shopCode: String,
    val shopName: String,
    val status: CollectionStopStatus,

    @SerialName("stopId")
    val stopID: String
)

@Serializable
enum class CollectionStopStatus(val value: String) {
    @SerialName("assigned") Assigned("assigned"),
    @SerialName("collected") Collected("collected"),
    @SerialName("short") CollectionStopStatusShort("short"),
    @SerialName("en_route") EnRoute("en_route");
}

/**
 * GET /driver/v1/collection/runs/{runId}/stops/{stopId} — a shop stop and its packages.
 */
@Serializable
data class CollectionStopDTO (
    /**
     * ⚠ See `CollectionStopSummary.address` — added by 063, retires the `stopAddress`
     * placeholder.
     */
    val address: String? = null,

    val packages: List<CollectionPackage>,
    val shopCode: String,
    val shopName: String,
    val status: CollectionStopStatus,

    @SerialName("stopId")
    val stopID: String
)

/**
 * POST /driver/v1/delivery/drops/{dropId}/contact — masked relay (capability-flagged, R6).
 */
@Serializable
data class ContactRequest (
    @SerialName("changeId")
    val changeID: String,

    val mode: Mode
)

@Serializable
enum class Mode(val value: String) {
    @SerialName("call") Call("call"),
    @SerialName("message") Message("message");
}

@Serializable
data class ContactResponse (
    val maskedChannel: String
)

/**
 * GET /driver/v1/delivery/drops/{dropId}
 */
@Serializable
data class DeliveryDropDTO (
    val addressFull: String,
    val customerName: String,

    @SerialName("dropId")
    val dropID: String,

    val instructions: String? = null,
    val orderRef: String,
    val packages: List<DropPackageRef>,
    val status: DeliveryDropStatus
)

@Serializable
data class DropPackageRef (
    val fromShopCount: Long,
    val ref: String
)

@Serializable
enum class DeliveryDropStatus(val value: String) {
    @SerialName("arrived") Arrived("arrived"),
    @SerialName("delivered") Delivered("delivered"),
    @SerialName("en_route") EnRoute("en_route"),
    @SerialName("failed") Failed("failed"),
    @SerialName("out_for_delivery") OutForDelivery("out_for_delivery"),
    @SerialName("staged") Staged("staged");
}

@Serializable
data class DeliveryDropSummary (
    val customerSuburb: String,

    @SerialName("dropId")
    val dropID: String,

    val orderRef: String,
    val packageCount: Long,
    val sequence: Long,
    val status: DeliveryDropStatus,
    val window: String? = null
)

/**
 * GET /driver/v1/delivery/runs/{runId}
 */
@Serializable
data class DeliveryRunDTO (
    val drops: List<DeliveryDropSummary>,

    @SerialName("runId")
    val runID: String,

    val status: String
)

/**
 * POST /driver/v1/delivery/drops/{dropId}/fail
 */
@Serializable
data class DropFailRequest (
    @SerialName("changeId")
    val changeID: String,

    val note: String? = null,
    val reason: DeliveryFailureReason
)

@Serializable
enum class DeliveryFailureReason(val value: String) {
    @SerialName("access_blocked") AccessBlocked("access_blocked"),
    @SerialName("customer_refused") CustomerRefused("customer_refused"),
    @SerialName("nobody_home") NobodyHome("nobody_home"),
    @SerialName("other") Other("other"),
    @SerialName("wrong_address") WrongAddress("wrong_address");
}

@Serializable
data class DropFailResponse (
    val status: DropFailResponseStatus
)

@Serializable
enum class DropFailResponseStatus(val value: String) {
    @SerialName("failed") Failed("failed");
}

/**
 * POST /driver/v1/delivery/drops/{dropId}/status
 */
@Serializable
data class DropStatusRequest (
    @SerialName("changeId")
    val changeID: String,

    val to: To
)

@Serializable
enum class To(val value: String) {
    @SerialName("arrived") Arrived("arrived"),
    @SerialName("en_route") EnRoute("en_route"),
    @SerialName("out_for_delivery") OutForDelivery("out_for_delivery");
}

@Serializable
data class DropStatusResponse (
    val status: DeliveryDropStatus
)

/**
 * POST /driver/v1/duty
 */
@Serializable
data class DutyRequest (
    /**
     * ⚠ 064, FR-018 — "I have seen what I am carrying and I am going off duty anyway."
     *
     * Going off duty with packages still in the van is REFUSED (409) until this is set, and the
     * refusal names every package. It is a confirmation, not a bypass: the requirement is that
     * a shift cannot end SILENTLY on a van with goods in it, not that it cannot end at all — a
     * driver whose van is genuinely empty, or who handed over some other way, says so and goes
     * home.
     *
     * 056 found that standing a driver down could strand physical goods permanently and
     * invisibly: the release sweep deliberately never reclaims picked-up work, so nothing else
     * would ever mention it.
     */
    val acknowledgeHeldPackages: Boolean? = null,

    @SerialName("changeId")
    val changeID: String,

    /**
     * ⚠ OPTIONAL, AND ITS ABSENCE MEANS UNKNOWN (061, FR-032/FR-033).
     *
     * When a driver goes on duty they may say when they expect to finish. It buys nothing today
     * — it exists so the dispatch slice can ask "can this driver finish this round before they
     * go home", which is otherwise unanswerable.
     *
     * ⚠ IT MUST NEVER BE DEFAULTED TO A SHIFT LENGTH. An invented finish time would make a
     * guess look like a fact at exactly the moment it decides someone's workload — and the
     * driver would be the one who found out.
     */
    val expectedEndAt: String? = null,

    val onDuty: Boolean
)

@Serializable
data class DutyResponse (
    val dutyStatus: DriverDutyStatus,

    /**
     * null = the driver did not say. Render as "unknown", never as a time.
     */
    val expectedEndAt: String? = null,

    val since: String? = null
)

@Serializable
enum class DriverDutyStatus(val value: String) {
    @SerialName("off_duty") OffDuty("off_duty"),
    @SerialName("on_duty") OnDuty("on_duty");
}

/**
 * GET /driver/v1/history
 */
@Serializable
data class HistoryDTO (
    val days: List<HistoryDay>
)

@Serializable
data class HistoryDay (
    val date: String,
    val drops: List<HistoryDropRow>,
    val runs: List<HistoryRunRow>
)

@Serializable
data class HistoryDropRow (
    val completedAt: String,
    val customerSuburb: String,

    @SerialName("dropId")
    val dropID: String,

    val orderRef: String,
    val proofCaptured: Boolean
)

@Serializable
data class HistoryRunRow (
    val completedAt: String? = null,

    @SerialName("runId")
    val runID: String,

    val stopCount: Long,
    val type: DriverRunType
)

/**
 * The two kinds of work a driver run can be. Named as a type by 056 because back-office
 * reads it too — it was an inline union used once, and a second consumer is exactly when a
 * concept earns a name (Principle II: one definition per concept, not one per file).
 *
 * ⚠ Work is TYPED TASKS, NOT DRIVER ROLES. One driver typically runs a collection round and
 * then a same-day round in the same shift; neither is a role they hold.
 */
@Serializable
enum class DriverRunType(val value: String) {
    @SerialName("collection") Collection("collection"),
    @SerialName("same_day_delivery") SameDayDelivery("same_day_delivery");
}

/**
 * GET /driver/v1/history/{kind}/{id}
 */
@Serializable
data class HistoryDetailDTO (
    val addressFull: String? = null,
    val packages: List<DropPackageRef>,
    val proof: Proof? = null,
    val timeline: List<TimelineEntry>
)

@Serializable
data class Proof (
    val capturedAt: String,

    @SerialName("mediaUrl")
    val mediaURL: String? = null,

    val method: ProofMethod,
    val note: String? = null
)

@Serializable
enum class ProofMethod(val value: String) {
    @SerialName("code") Code("code"),
    @SerialName("contactless") Contactless("contactless"),
    @SerialName("photo") Photo("photo"),
    @SerialName("signature") Signature("signature");
}

@Serializable
data class TimelineEntry (
    val at: String,
    val status: String
)

/**
 * POST /driver/v1/hub/checkin
 */
@Serializable
data class HubCheckinRequest (
    @SerialName("changeId")
    val changeID: String,

    @SerialName("runId")
    val runID: String
)

@Serializable
data class HubCheckinResponse (
    val sameDayCount: Long,
    val scannedTotal: Long,
    val standardCount: Long
)

@Serializable
data class MapPoint (
    val lat: Double,
    val lng: Double
)

@Serializable
data class MapStop (
    val id: String,
    val kind: MapStopKind,
    val lat: Double,
    val lng: Double,
    val sequence: Long
)

@Serializable
enum class MapStopKind(val value: String) {
    @SerialName("drop") Drop("drop"),
    @SerialName("hub") Hub("hub"),
    @SerialName("shop") Shop("shop");
}

/**
 * GET /driver/v1/me — the record-backed identity read. Display strings only; no currency.
 */
@Serializable
data class DriverMeDTO (
    val dutyStatus: DriverDutyStatus,
    val hub: String? = null,
    val id: String,
    val name: String,
    val vehicle: DriverVehicle,
    val workEmail: String,

    /**
     * What the driver is cleared to cover, as one line for their own Account screen.
     *
     * ⚠ THE SHAPE IS UNCHANGED BY 062 AND THAT IS DELIBERATE — `apps/driver-mobile` renders it
     * in three places (Today, Help, Account) and it is part of the generated Kotlin contract.
     * What changed is where it COMES FROM: until 062 this was a single assigned zone that no
     * assignment code ever read; it is now DERIVED from the driver's clearances. The app tells
     * the truth without a line of Kotlin changing — the same move 061 made for
     * `DriverVehicle`.
     *
     * null when the driver is cleared for nothing, which is an ordinary state for a new starter
     * and one the app already renders as unavailable rather than as a broken row.
     */
    val zone: String? = null
)

/**
 * What the driver is currently driving, for their own Account screen.
 *
 * ⚠ THE SHAPE IS UNCHANGED BY 061 AND THAT IS DELIBERATE — `apps/driver-mobile` renders it
 * (`DriverMappers.kt`, `AccountScreen.kt`) and it is part of the generated Kotlin contract.
 * What changed is where it COMES FROM: until 061 these were two free-text columns on the
 * driver row that nobody maintained; they are now read from the driver's open
 * `vehicle_holding` and the real vehicle behind it. The app shows a true answer without a
 * single line of Kotlin changing.
 *
 * Both fields are null when the driver holds no vehicle, which is an ordinary state.
 */
@Serializable
data class DriverVehicle (
    val plate: String? = null,
    val type: String? = null
)

@Serializable
data class ProblemJSON (
    val detail: String? = null,

    /**
     * ⚠ THE WIRE KEY IS `errors`. `@effy/edge-shared`'s `problem()` has always serialised field
     * issues under `errors`; `fields` was the name only this type used, so every reader keying
     * off it saw nothing. Both are declared so the mismatch is visible here rather than
     * rediscovered per surface (053 found it; 054 fixed the reader in `@effy/api-client`).
     */
    val errors: List<ProblemFieldIssue>? = null,

    val fields: List<ProblemFieldIssue>? = null,
    val instance: String? = null,
    val status: Double,
    val title: String,
    val type: String
)

/**
 * RFC 9457 problem+json — the platform's single machine-readable error shape (mirrors
 * docs/api/error-envelope.md from 004). Typed ONCE here (Principle II); every web surface
 * consumes it, never re-declares it.
 */
@Serializable
data class ProblemFieldIssue (
    /**
     * The offending field path — or, for a whole-request refusal, a STABLE MACHINE-READABLE
     * CODE.
     *
     * ⚠ 032 uses the second form for delivery-pricing refusals (`cap_below_floor`,
     * `bands_required`, …). "Please check the fields and try again" tells an operator nothing
     * about which of five rules they broke, and every one of those rules fails SILENTLY in
     * production if it is not understood — a cap below the floor makes every delivery cost the
     * cap, forever.
     */
    val field: String,

    val message: String
)

/**
 * POST /driver/v1/delivery/drops/{dropId}/proof/presign
 */
@Serializable
data class ProofPresignRequest (
    @SerialName("changeId")
    val changeID: String,

    val contentType: String,
    val fileSize: Long
)

@Serializable
data class ProofPresignResponse (
    val mediaKey: String,

    @SerialName("uploadUrl")
    val uploadURL: String
)

/**
 * POST /driver/v1/delivery/drops/{dropId}/proof
 */
@Serializable
data class ProofRequest (
    @SerialName("changeId")
    val changeID: String,

    val code: String? = null,
    val mediaKey: String? = null,
    val method: ProofMethod,
    val note: String? = null
)

@Serializable
data class ProofResponse (
    val status: ProofResponseStatus
)

@Serializable
enum class ProofResponseStatus(val value: String) {
    @SerialName("delivered") Delivered("delivered");
}

/**
 * GET /driver/v1/runs/{runId}/map
 */
@Serializable
data class RunMapDTO (
    val currentLocation: MapPoint? = null,
    val hub: MapPoint,
    val stops: List<MapStop>
)

/**
 * GET /driver/v1/today
 */
@Serializable
data class TodayDTO (
    val active: TodayItemRef? = null,

    @SerialName("activeRunId")
    val activeRunID: String? = null,

    val phase: DriverPhase,
    val remainingCount: Long,
    val upNext: List<TodayItemRef>
)

/**
 * A compact reference to the active/queued work item shown on the home.
 *
 * ⚠ `"hub_checkin"` ADDED BY 064, AND IT FIXES A LIVE DEFECT. A collection round's work did
 * not end at its last shop — the load still has to be checked in at the hub — but the hub
 * had no representation here, so `todayView`'s outstanding filter emptied the moment the
 * final shop stop went `done`. Both routes into the round (the hero card, drawn from
 * `active`, and the "Whole run" link, drawn only when `upNext` is non-empty) vanished at
 * exactly that point. Found live on 2026-09-21 with a driver holding thirteen packages and
 * no way back into their own round.
 */
@Serializable
data class TodayItemRef (
    val id: String,
    val kind: TodayItemRefKind,

    @SerialName("runId")
    val runID: String,

    val status: String,
    val subtitle: String? = null,
    val title: String
)

@Serializable
enum class TodayItemRefKind(val value: String) {
    @SerialName("collection_stop") CollectionStop("collection_stop"),
    @SerialName("delivery_drop") DeliveryDrop("delivery_drop"),
    @SerialName("hub_checkin") HubCheckin("hub_checkin");
}

/**
 * ⚠ `LocationRequest` STOOD HERE AND IS GONE (061) — see the note below.
 */
@Serializable
enum class DriverPhase(val value: String) {
    @SerialName("collection") Collection("collection"),
    @SerialName("idle") Idle("idle"),
    @SerialName("same_day_delivery") SameDayDelivery("same_day_delivery");
}
