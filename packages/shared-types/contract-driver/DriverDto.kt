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
 * POST /driver/v1/collection/tasks/{taskId}/collect
 */
@Serializable
data class CollectRequest (
    @SerialName("changeId")
    val changeID: String
)

@Serializable
data class CollectResponse (
    val status: CollectResponseStatus
)

@Serializable
enum class CollectResponseStatus(val value: String) {
    @SerialName("collected") Collected("collected");
}

/**
 * POST /driver/v1/collection/tasks/{taskId}/issue
 */
@Serializable
data class CollectionIssueRequest (
    @SerialName("changeId")
    val changeID: String,

    val kind: CollectionIssueKind,
    val note: String? = null,

    @SerialName("orderItemId")
    val orderItemID: String? = null
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
    val packageCount: Long,
    val sequence: Long,
    val shopAddress: String,
    val shopName: String,
    val status: CollectionTaskStatus,

    @SerialName("taskId")
    val taskID: String
)

@Serializable
enum class CollectionTaskStatus(val value: String) {
    @SerialName("assigned") Assigned("assigned"),
    @SerialName("collected") Collected("collected"),
    @SerialName("short") CollectionTaskStatusShort("short"),
    @SerialName("en_route") EnRoute("en_route");
}

/**
 * GET /driver/v1/collection/tasks/{taskId}
 */
@Serializable
data class CollectionTaskDTO (
    val packages: List<CollectionPackage>,
    val shopAddress: String,
    val shopName: String,
    val status: CollectionTaskStatus,

    @SerialName("taskId")
    val taskID: String
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
    @SerialName("changeId")
    val changeID: String,

    val onDuty: Boolean
)

@Serializable
data class DutyResponse (
    val dutyStatus: DriverDutyStatus,
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
    val type: Type
)

@Serializable
enum class Type(val value: String) {
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

/**
 * POST /driver/v1/location — optional point-in-time snapshot (never streamed).
 */
@Serializable
data class LocationRequest (
    @SerialName("changeId")
    val changeID: String,

    val lat: Double,
    val lng: Double
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
    val zone: String? = null
)

@Serializable
data class DriverVehicle (
    val plate: String? = null,
    val type: String? = null
)

@Serializable
data class ProblemJSON (
    val detail: String? = null,
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

    val contentType: String
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
    @SerialName("delivery_drop") DeliveryDrop("delivery_drop");
}

@Serializable
enum class DriverPhase(val value: String) {
    @SerialName("collection") Collection("collection"),
    @SerialName("idle") Idle("idle"),
    @SerialName("same_day_delivery") SameDayDelivery("same_day_delivery");
}
