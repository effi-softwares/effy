// GENERATED FROM packages/shared-types/src/driver.ts (+ problem.ts) — DO NOT EDIT.
// Regenerate: pnpm --filter @effy/shared-types driver-contract:gen
// The wire contract lives in TypeScript ONCE (Principle II); this file is derived and diff-guarded.

package com.effyshopping.driver.mobile.contract

import kotlinx.serialization.*
import kotlinx.serialization.json.*
import kotlinx.serialization.descriptors.*
import kotlinx.serialization.encoding.*

@Serializable
data class CollectRequest (
    @SerialName("changeId")
    val changeID: String,

    val missingParcels: List<ParcelMissing>? = null,

    /**
     * Every package the driver was shown at this stop, with its outcome, in one request. Only
     * what is named is settled: an unnamed package stays waiting and the stop stays open
     * (`CollectResponse.remaining`).
     */
    val packages: List<Package>,

    val parcels: List<ParcelHandover>? = null,
    val reads: List<LabelReadDTO>? = null
)

@Serializable
data class ParcelMissing (
    val note: String? = null,
    val parcelCode: String? = null,

    @SerialName("parcelId")
    val parcelID: String? = null,

    val reason: ParcelMissingReason
)

/**
 * Why a bag was not handed over at a step. `other` needs a note.
 */
@Serializable
enum class ParcelMissingReason(val value: String) {
    @SerialName("damaged") Damaged("damaged"),
    @SerialName("not_at_hub") NotAtHub("not_at_hub"),
    @SerialName("not_at_shop") NotAtShop("not_at_shop"),
    @SerialName("not_in_van") NotInVan("not_in_van"),
    @SerialName("other") Other("other"),
    @SerialName("wrong_temperature") WrongTemperature("wrong_temperature");
}

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
data class ParcelHandover (
    val method: HandoverMethod,
    val parcelCode: String? = null,

    @SerialName("parcelId")
    val parcelID: String? = null
)

/**
 * How a package was handed over: scanned from its label, its code typed (a torn label), or
 * ticked by hand.
 */
@Serializable
enum class HandoverMethod(val value: String) {
    @SerialName("manual") Manual("manual"),
    @SerialName("scan") Scan("scan"),
    @SerialName("typed") Typed("typed");
}

/**
 * One read as the client made and judged it. `clientReadId` makes an offline replay record
 * once; `deviceAt` is when it happened on the device, kept however late it arrives.
 */
@Serializable
data class LabelReadDTO (
    val appVersion: String? = null,

    @SerialName("clientReadId")
    val clientReadID: String,

    val deviceAt: String,

    @SerialName("deviceId")
    val deviceID: String? = null,

    val method: ReadMethod,
    val outcome: ReadOutcome,
    val parcelCode: String? = null,
    val raw: String
)

/**
 * How a read was made. A bag ticked by hand is not a read: it is a hand-over with method
 * `manual`.
 */
@Serializable
enum class ReadMethod(val value: String) {
    @SerialName("scan") Scan("scan"),
    @SerialName("typed") Typed("typed");
}

/**
 * What a read means, everywhere. `not_found` is decided by the server only.
 */
@Serializable
enum class ReadOutcome(val value: String) {
    @SerialName("accepted") Accepted("accepted"),
    @SerialName("already_counted") AlreadyCounted("already_counted"),
    @SerialName("belongs_elsewhere") BelongsElsewhere("belongs_elsewhere"),
    @SerialName("cancelled") Cancelled("cancelled"),
    @SerialName("not_a_label") NotALabel("not_a_label"),
    @SerialName("not_found") NotFound("not_found"),
    @SerialName("not_on_this_work") NotOnThisWork("not_on_this_work"),
    @SerialName("voided") Voided("voided");
}

@Serializable
data class CollectResponse (
    /**
     * How many were collected and declared not available by this call.
     */
    val collected: Long? = null,

    val notAvailable: Long? = null,

    /**
     * Packages on the stop this request did not name (added meanwhile); when above 0 the stop
     * stays open and the app re-reads it.
     */
    val remaining: Long? = null,

    val status: CollectResponseStatus
)

@Serializable
enum class CollectResponseStatus(val value: String) {
    @SerialName("collected") Collected("collected");
}

/**
 * POST /driver/v1/collection/runs/{runId}/stops/{stopId}/issue: report a missing or short
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
    /**
     * Who takes it from the hub: an Effy driver or a courier.
     */
    val deliveredBy: DeliveredBy,

    val destinationSuburb: String,

    /**
     * This package's own lines.
     */
    val items: List<ManifestLine>,

    /**
     * The code on this package's label (`EFY1:<code>`): bag 1's.
     */
    val packageCode: String,

    /**
     * The package's own id, as `CollectRequest.packages[].packageId` names it.
     */
    @SerialName("packageId")
    val packageID: String,

    /**
     * The package's live bags ("Bag n of N"); every step accounts for every bag.
     */
    val parcels: List<ParcelDTO>,

    val ref: String,
    val summary: ClassSummary,

    /**
     * The day and window an Effy parcel is for, in the server's words; null when none.
     */
    val windowLabel: String? = null
)

/**
 * Who takes it from the hub: an Effy driver or a courier.
 */
@Serializable
enum class DeliveredBy(val value: String) {
    @SerialName("courier") Courier("courier"),
    @SerialName("effy") Effy("effy");
}

@Serializable
data class ManifestLine (
    /**
     * False when the shop supplied none of this line. Shown as "not included", never hidden.
     */
    val included: Boolean,

    val name: String,
    val orderedQty: Long,

    /**
     * The quantity in the bag: what the shop gathered (less than `orderedQty` when
     * part-supplied, 0 when not supplied).
     */
    val qty: Long,

    val temperatureClass: TemperatureClass
)

/**
 * How an item must be carried, in the driver's words (the catalogue's `ambient` is shown
 * "Normal").
 */
@Serializable
enum class TemperatureClass(val value: String) {
    @SerialName("chilled") Chilled("chilled"),
    @SerialName("frozen") Frozen("frozen"),
    @SerialName("normal") Normal("normal");
}

/**
 * A live parcel as every surface sees it. `of` = this package's live bags.
 */
@Serializable
data class ParcelDTO (
    val code: String,
    val of: Long,

    @SerialName("parcelId")
    val parcelID: String,

    val seq: Long,
    val zone: ParcelZone
)

@Serializable
enum class ParcelZone(val value: String) {
    @SerialName("ambient") Ambient("ambient"),
    @SerialName("chilled") Chilled("chilled"),
    @SerialName("frozen") Frozen("frozen");
}

/**
 * Units in the bag per class, counting only supplied lines. Every field is present; clients
 * omit zeros.
 *
 * The sum of `packages[].summary`.
 *
 * The drop's total across its packages, so cold goods show in the list.
 */
@Serializable
data class ClassSummary (
    val chilled: Long,
    val frozen: Long,
    val normal: Long
)

/**
 * GET /driver/v1/collection/runs/{runId}.
 */
@Serializable
data class DriverCollectionRunDTO (
    /**
     * When collecting must be finished.
     */
    val deadlineAt: String,

    val dueLabel: String,

    /**
     * Where each package goes at the hub, in the platform's words, so the hub scan can say it
     * offline.
     */
    val hubSort: List<HubSortInstruction>,

    /**
     * The run map.
     */
    val map: RunMapDTO? = null,

    /**
     * When this round opens; `null` = open.
     */
    val opening: RoundOpening? = null,

    @SerialName("runId")
    val runID: String,

    /**
     * The run's stage and its words.
     */
    val stage: String? = null,

    val stageLabel: String? = null,
    val status: String,
    val stops: List<CollectionStopSummary>
)

/**
 * One package's hub instruction. `label` is the whole line: "LOAD NOW · Today 4–6 pm".
 */
@Serializable
data class HubSortInstruction (
    /**
     * `load_now` | `shelve` | `courier_bay` (`HubSortKind`), a string on the wire so a new kind
     * cannot break the read; an unknown kind shows the label.
     */
    val kind: String,

    val label: String,
    val packageCode: String,

    /**
     * Every bag of this package: each scanned at the hub gets this instruction.
     */
    val parcelCodes: List<String>
)

@Serializable
data class RunMapDTO (
    /**
     * The hub's point, where "Navigate to the hub" goes.
     */
    val hub: RunMapPoint? = null,

    /**
     * In route order: a collection run ends at the hub, a delivery run starts there.
     */
    val stops: List<RunMapStop>
)

/**
 * The run map, decorative: where a run's stops roughly are, for a small schematic. A stop's
 * point is its postcode's place (never a geocoded address or a device position); the hub's
 * is its own. Nothing that orders or assigns work reads it. Stops with no point are left
 * out.
 */
@Serializable
data class RunMapPoint (
    val lat: Double,
    val lng: Double
)

@Serializable
data class RunMapStop (
    val kind: RunMapStopKind,

    /**
     * The stop's number in the run's list; null for the hub.
     */
    val n: Long? = null,

    val point: RunMapPoint,
    val status: RunMapStopStatus
)

@Serializable
enum class RunMapStopKind(val value: String) {
    @SerialName("customer") Customer("customer"),
    @SerialName("hub") Hub("hub"),
    @SerialName("shop") Shop("shop");
}

@Serializable
enum class RunMapStopStatus(val value: String) {
    @SerialName("done") Done("done"),
    @SerialName("next") Next("next"),
    @SerialName("todo") Todo("todo");
}

/**
 * When a round opens. Sent only for a round not yet open (the server judges by its own
 * clock), so a wrong phone clock cannot lock an open round.
 */
@Serializable
data class RoundOpening (
    /**
     * The instant, ISO 8601, which the app's clock is compared with to unlock by itself.
     */
    val at: String,

    /**
     * The same moment in words, Melbourne time. The app never formats a time.
     */
    val label: String
)

@Serializable
data class CollectionStopSummary (
    /**
     * The shop's address for the device's maps app (never a position). Null when not yet
     * recorded, which back-office readiness reports; the driver is told it is missing.
     */
    val address: String? = null,

    val packageCount: Long,

    /**
     * The stop's live bags, each with its own code ("Bag n of N"), for matching a scan offline.
     */
    val parcels: List<ParcelDTO>,

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
 * GET /driver/v1/collection/runs/{runId}/stops/{stopId}: a shop stop and its packages.
 */
@Serializable
data class CollectionStopDTO (
    /**
     * See `CollectionStopSummary.address`.
     */
    val address: String? = null,

    /**
     * When this stop's round opens; `null` = open. Collecting is refused before then.
     */
    val opening: RoundOpening? = null,

    val packages: List<CollectionPackage>,
    val shopCode: String,
    val shopName: String,
    val status: CollectionStopStatus,

    @SerialName("stopId")
    val stopID: String
)

/**
 * POST /driver/v1/delivery/drops/{dropId}/contact: masked relay (capability-flagged).
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
 * GET /driver/v1/delivery/drops/{dropId}.
 */
@Serializable
data class DeliveryDropDTO (
    val addressFull: String,
    val customerName: String,

    /**
     * The customer's checkout phone, for calling from the door: sent only while the drop is
     * open and only to the round's own driver; never in history or run lists.
     */
    val customerPhone: String? = null,

    /**
     * The window the customer was sold. Due and late are derived by the app from the clock,
     * never sent.
     */
    val deliveryWindow: DeliveryWindow? = null,

    @SerialName("dropId")
    val dropID: String,

    /**
     * How the customer asked for the order to be handed over, or null. A request, not a
     * constraint: the app says it and leads the proof chooser with it, but never removes a way
     * of completing the drop.
     */
    val handover: HandoverPreference? = null,

    /**
     * The customer's note to the driver, verbatim plain text; null when they wrote none.
     */
    val instructions: String? = null,

    /**
     * The van has been loaded with this drop; until then nothing on it can be done.
     */
    val loaded: Boolean? = null,

    /**
     * When this drop's round opens; `null` = open. Every action is refused before then.
     */
    val opening: RoundOpening? = null,

    val orderRef: String,
    val packages: List<DropPackageRef>,
    val status: DeliveryDropStatus,

    /**
     * The sum of `packages[].summary`.
     */
    val summary: ClassSummary,

    /**
     * The same window as a ready-made label in Melbourne time ("5 pm – 7 pm"), so the app never
     * formats a time.
     */
    val window: String? = null
)

/**
 * A delivery window, as two instants.
 */
@Serializable
data class DeliveryWindow (
    /**
     * ISO-8601 instant.
     */
    val endAt: String,

    /**
     * ISO-8601 instant.
     */
    val startAt: String
)

/**
 * Delivery instructions: how to hand the order over, and a short note. The vocabulary, the
 * length limit and the normalisation rule live here only; the customer surfaces use them
 * for a remaining-characters count and checkout calls `normaliseDeliveryInstructions`
 * itself, so client and server agree. `delivery-instructions.fixtures.json` is the rule's
 * table of cases.
 */
@Serializable
enum class HandoverPreference(val value: String) {
    @SerialName("leave_at_door") LeaveAtDoor("leave_at_door"),
    @SerialName("meet_at_door") MeetAtDoor("meet_at_door");
}

/**
 * One physical package at a drop, in a stable order the app labels by position ("Package 1
 * of 2"). A package is one shop's portion, so it carries no shop id, name or code, and
 * never may.
 */
@Serializable
data class DropPackageRef (
    val fromShopCount: Long,
    val items: List<ManifestLine>,

    /**
     * The code on this package's label (`EFY1:<code>`): bag 1's.
     */
    val packageCode: String,

    /**
     * The package's live bags ("Bag n of N"); every step accounts for every bag.
     */
    val parcels: List<ParcelDTO>,

    val ref: String,
    val summary: ClassSummary
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
    /**
     * When and how a finished drop was finished: the proof method or the failure reason.
     */
    val completedAt: String? = null,

    val customerSuburb: String,

    /**
     * The same window as instants, so the app can say Due and Late as the clock moves.
     */
    val deliveryWindow: DeliveryWindow? = null,

    @SerialName("dropId")
    val dropID: String,

    val failureReason: DeliveryFailureReason? = null,
    val orderRef: String,
    val packageCount: Long,

    /**
     * The drop's live bags ("Bag n of N"), for matching a scan offline.
     */
    val parcels: List<ParcelDTO>,

    val proofMethod: ProofMethod? = null,
    val sequence: Long,
    val status: DeliveryDropStatus,

    /**
     * The street line, for the run list ("5 Faraday St"); null when the address has none.
     */
    val street: String? = null,

    /**
     * The drop's total across its packages, so cold goods show in the list.
     */
    val summary: ClassSummary,

    /**
     * The window as a ready-made label, e.g. "5 pm – 7 pm" (Melbourne time).
     */
    val window: String? = null
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
enum class ProofMethod(val value: String) {
    @SerialName("code") Code("code"),
    @SerialName("contactless") Contactless("contactless"),
    @SerialName("photo") Photo("photo"),
    @SerialName("signature") Signature("signature");
}

/**
 * GET /driver/v1/delivery/runs/{runId}.
 */
@Serializable
data class DeliveryRunDTO (
    /**
     * The end of the delivery window, or of the day where there is none.
     */
    val deadlineAt: String,

    val drops: List<DeliveryDropSummary>,
    val dueLabel: String,

    /**
     * The run map.
     */
    val map: RunMapDTO? = null,

    /**
     * When this round opens; `null` = open.
     */
    val opening: RoundOpening? = null,

    @SerialName("runId")
    val runID: String,

    /**
     * The run's stage and its words.
     */
    val stage: String? = null,

    val stageLabel: String? = null,
    val status: String,

    /**
     * Parcels from failed drops on this run, still with the driver, to be checked back in at
     * the hub; `null` when none.
     */
    val toReturn: ParcelsToReturn? = null
)

/**
 * What a driver still has to bring back to the hub from a delivery run's failed drops.
 */
@Serializable
data class ParcelsToReturn (
    val count: Long,

    /**
     * Order numbers only: no address, no customer.
     */
    val orders: List<String>,

    /**
     * Each parcel for the Return to hub screen: its ref, where it was for and why it came back.
     */
    val parcels: List<ReturnParcel>,

    @SerialName("runId")
    val runID: String
)

@Serializable
data class ReturnParcel (
    val packageCode: String,

    /**
     * The package's live bags ("Bag n of N"); every step accounts for every bag.
     */
    val parcels: List<ParcelDTO>,

    /**
     * "8 Scotchmer St, Fitzroy North".
     */
    val place: String? = null,

    val reason: DeliveryFailureReason? = null,
    val ref: String
)

/**
 * POST /driver/v1/delivery/drops/{dropId}/fail.
 */
@Serializable
data class DropFailRequest (
    @SerialName("changeId")
    val changeID: String,

    val note: String? = null,
    val reason: DeliveryFailureReason
)

@Serializable
data class DropFailResponse (
    val status: DropFailResponseStatus
)

@Serializable
enum class DropFailResponseStatus(val value: String) {
    @SerialName("failed") Failed("failed");
}

/**
 * POST /driver/v1/delivery/drops/{dropId}/status.
 */
@Serializable
data class DropStatusRequest (
    @SerialName("changeId")
    val changeID: String,

    /**
     * `out_for_delivery` is written only by loading the van.
     */
    val to: To
)

/**
 * `out_for_delivery` is written only by loading the van.
 */
@Serializable
enum class To(val value: String) {
    @SerialName("arrived") Arrived("arrived"),
    @SerialName("en_route") EnRoute("en_route");
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
     * "I have seen what I am carrying and I am going off duty anyway." Going off duty with
     * packages in the van is refused (409, naming every package) until this is set: a shift
     * cannot end silently on goods.
     */
    val acknowledgeHeldPackages: Boolean? = null,

    @SerialName("changeId")
    val changeID: String,

    /**
     * When the driver expects to finish, if they say; absence means unknown. Never defaulted to
     * a shift length: a guess would decide someone's workload as if it were a fact.
     */
    val expectedEndAt: String? = null,

    val onDuty: Boolean
)

@Serializable
data class DutyResponse (
    val dutyStatus: DriverDutyStatus,

    /**
     * null: the driver did not say. Render as "unknown", never as a time.
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
 * GET /driver/v1/history.
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

    /**
     * Set for a drop that was not delivered (its parcels went back to the hub).
     */
    val failureReason: DeliveryFailureReason? = null,

    val orderRef: String,
    val proofCaptured: Boolean,
    val proofMethod: ProofMethod? = null,

    /**
     * The street line, how it was handed over, and for a drop that came back, why.
     */
    val street: String? = null
)

@Serializable
data class HistoryRunRow (
    val completedAt: String? = null,

    /**
     * Packages on the run, and a delivery run's window in words.
     */
    val packageCount: Long? = null,

    @SerialName("runId")
    val runID: String,

    val stopCount: Long,
    val type: DriverRunType,
    val window: String? = null
)

/**
 * The two kinds of work a driver run can be (back-office reads it too). Work is typed
 * tasks, not roles: one driver often runs a collection round and then a delivery round in a
 * shift.
 */
@Serializable
enum class DriverRunType(val value: String) {
    @SerialName("collection") Collection("collection"),
    @SerialName("delivery") Delivery("delivery");
}

/**
 * GET /driver/v1/history/{kind}/{id}.
 */
@Serializable
data class HistoryDetailDTO (
    val addressFull: String? = null,

    /**
     * Why a drop came back to the hub.
     */
    val failureReason: DeliveryFailureReason? = null,

    /**
     * A run's map (every stop done), and its window in words.
     */
    val map: RunMapDTO? = null,

    val orderRef: String? = null,

    /**
     * A drop's packages, and the window it was sold.
     */
    val packageCount: Long? = null,

    val packages: List<DropPackageRef>,
    val proof: Proof? = null,

    /**
     * For a run: its stops in order, each with how it ended. Absent for a drop.
     */
    val stops: List<HistoryStop>? = null,

    val timeline: List<TimelineEntry>,
    val window: String? = null
)

@Serializable
data class Proof (
    val capturedAt: String,

    @SerialName("mediaUrl")
    val mediaURL: String? = null,

    val method: ProofMethod,
    val note: String? = null
)

/**
 * One stop of a finished run, as History lists it. No money, no customer name.
 */
@Serializable
data class HistoryStop (
    val completedAt: String? = null,

    /**
     * Why a drop came back to the hub.
     */
    val failureReason: DeliveryFailureReason? = null,

    val kind: PurpleKind,
    val proofMethod: ProofMethod? = null,
    val sequence: Long,
    val status: PurpleStatus,

    @SerialName("stopId")
    val stopID: String,

    /**
     * The shop's name, the drop's street and suburb, or "Hub check-in".
     */
    val title: String
)

@Serializable
enum class PurpleKind(val value: String) {
    @SerialName("drop") Drop("drop"),
    @SerialName("hub") Hub("hub"),
    @SerialName("shop") Shop("shop");
}

@Serializable
enum class PurpleStatus(val value: String) {
    @SerialName("done") Done("done"),
    @SerialName("skipped") Skipped("skipped");
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

    val missingParcels: List<ParcelMissing>? = null,
    val parcels: List<ParcelHandover>? = null,
    val reads: List<LabelReadDTO>? = null,

    @SerialName("runId")
    val runID: String
)

@Serializable
data class HubCheckinResponse (
    /**
     * Parcels a courier takes from the hub.
     */
    val courierCount: Long,

    /**
     * Parcels Effy delivers, in all and by the day and window each waits for; the driver
     * classifies nothing. `label` is written by the server ("Today, 4 pm – 6 pm"). A parcel
     * sold no window has null instants.
     */
    val effyCount: Long,

    val effyGroups: List<HubCheckinEffyGroup>,

    /**
     * Packages declared not in the van at this check-in, now held for dispatch.
     */
    val held: Long? = null,

    /**
     * When the courier next collects from the hub, in the server's words; null when no courier
     * parcel or no service.
     */
    val nextCourierPickupLabel: String? = null,

    val scannedTotal: Long
)

/**
 * The Effy parcels of one check-in that wait for one day and window.
 */
@Serializable
data class HubCheckinEffyGroup (
    /**
     * Sold a day with no time.
     */
    val anyTime: Boolean? = null,

    val count: Long,

    /**
     * yyyy-mm-dd (Melbourne) of the window; null for a parcel sold no window.
     */
    val date: String? = null,

    /**
     * True when these go out today (loaded for a delivery round); false means shelved for a
     * later day. Decided by the server.
     */
    val dueToday: Boolean,

    val label: String,
    val windowEnd: String? = null,
    val windowStart: String? = null
)

/**
 * POST /driver/v1/delivery/runs/{runId}/load: the van is loaded; every staged drop goes out.
 */
@Serializable
data class LoadRequest (
    @SerialName("changeId")
    val changeID: String,

    val missingParcels: List<ParcelMissing>? = null,
    val parcels: List<ParcelHandover>? = null,
    val reads: List<LabelReadDTO>? = null
)

@Serializable
data class LoadResponse (
    val dropsRemoved: Long? = null,

    /**
     * Packages taken off the run as not loaded, and drops removed because nothing was left.
     */
    val held: Long? = null,

    /**
     * How many drops this call moved to out for delivery.
     */
    val loaded: Long
)

/**
 * "Load the van": the run, and what goes in it.
 */
@Serializable
data class LoadStep (
    val dropCount: Long,
    val packageCount: Long,

    @SerialName("runId")
    val runID: String
)

/**
 * GET /driver/v1/me: the record-backed identity. Display strings only.
 */
@Serializable
data class DriverMeDTO (
    val dutyStatus: DriverDutyStatus,
    val hub: String? = null,
    val id: String,
    val name: String,
    val vehicle: DriverVehicle,

    /**
     * Today's pre-trip vehicle check: `due` until answered (no work until then), `unsafe` until
     * a dispatcher clears it, `none` with no vehicle.
     */
    val vehicleCheck: DriverVehicleCheckState? = null,

    val workEmail: String,

    /**
     * What the driver is cleared to cover, as one line (Today, Help, Account), derived from
     * their clearances. Null when cleared for nothing, which the app renders as unavailable.
     */
    val zone: String? = null
)

/**
 * What the driver is driving, for their Account screen, read from their open vehicle
 * holding. Both fields are null when they hold no vehicle.
 */
@Serializable
data class DriverVehicle (
    val plate: String? = null,
    val type: String? = null
)

/**
 * The state of the driver's vehicle check today.
 */
@Serializable
data class DriverVehicleCheckState (
    /**
     * `due` | `ok` | `unsafe` | `none`, a string on the wire; the app treats an unknown value
     * as `ok`.
     */
    val state: String,

    /**
     * "Toyota HiAce · ABC123", for the check screen's title.
     */
    val vehicleLabel: String? = null
)

/**
 * POST /driver/v1/delivery/runs/{runId}/return.
 */
@Serializable
data class ParcelReturnRequest (
    @SerialName("changeId")
    val changeID: String,

    val missingParcels: List<ParcelMissing>? = null,
    val parcels: List<ParcelHandover>? = null,
    val reads: List<LabelReadDTO>? = null
)

@Serializable
data class ParcelReturnResponse (
    /**
     * How many parcels this call returned; 0 when nothing was left to return.
     */
    val returned: Long,

    /**
     * True when the run is now finished.
     */
    val roundComplete: Boolean
)

/**
 * The 409 when a live bag was neither handed over nor declared missing.
 */
@Serializable
data class ParcelsUnaccountedProblem (
    val detail: String,
    val parcels: List<Parcel>,
    val type: Type
)

@Serializable
data class Parcel (
    val code: String,
    val of: Long,
    val seq: Long
)

@Serializable
enum class Type(val value: String) {
    @SerialName("parcels_unaccounted") ParcelsUnaccounted("parcels_unaccounted");
}

@Serializable
data class ProblemJSON (
    /**
     * A stable refusal code where the route defines one (e.g. `slot_required`), mapped by the
     * client to its own copy; `detail` is prose.
     */
    val code: String? = null,

    val detail: String? = null,

    /**
     * Field issues (the wire key is `errors`).
     */
    val errors: List<ProblemFieldIssue>? = null,

    val instance: String? = null,
    val status: Double,
    val title: String,
    val type: String
)

/**
 * RFC 9457 problem+json: the platform's one machine-readable error shape.
 */
@Serializable
data class ProblemFieldIssue (
    /**
     * The offending field path, or for a whole-request refusal a stable machine-readable code
     * (e.g. `cap_below_floor`, `bands_required`), so the client can say which rule was broken.
     */
    val field: String,

    val message: String
)

/**
 * POST /driver/v1/delivery/drops/{dropId}/proof/presign.
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
 * POST /driver/v1/delivery/drops/{dropId}/proof.
 */
@Serializable
data class ProofRequest (
    @SerialName("changeId")
    val changeID: String,

    val code: String? = null,
    val mediaKey: String? = null,
    val method: ProofMethod,
    val missingParcels: List<ParcelMissing>? = null,
    val note: String? = null,

    /**
     * Every bag of the drop, handed over or declared missing (`ParcelStepFields`).
     */
    val parcels: List<ParcelHandover>? = null,

    val reads: List<LabelReadDTO>? = null
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
 * GET /driver/v1/today
 */
@Serializable
data class TodayDTO (
    val active: TodayItemRef? = null,

    @SerialName("activeRunId")
    val activeRunID: String? = null,

    /**
     * What dispatch changed on the current round while under way ("Added 2 drops"); null when
     * nothing. Shown until dismissed.
     */
    val changedNote: String? = null,

    /**
     * The current round's deadline; `null` only with no current round.
     */
    val deadlineAt: String? = null,

    /**
     * The deadline in words, Melbourne time ("2 pm", "tomorrow 11 am").
     */
    val dueLabel: String? = null,

    /**
     * The current run is an open delivery run not yet loaded: loading is next, `active` is
     * null, and no drop can be done before it.
     */
    val loadStep: LoadStep? = null,

    val map: RunMapDTO? = null,

    /**
     * When the current round opens; `null` means open (or none). Work is assigned as soon as a
     * driver can take it; its actions are refused until it opens (409 `round_not_open`, with
     * `opensAt` and `opensLabel` as field issues).
     */
    val opening: RoundOpening? = null,

    val phase: DriverPhase,

    /**
     * Progress through the current round, and its map.
     */
    val progress: TodayProgress? = null,

    val remainingCount: Long,

    /**
     * The current run's stage (`RunStage`) and its words ("Collecting 2 of 5").
     */
    val stage: String? = null,

    val stageLabel: String? = null,

    /**
     * The current round's parcels still to return to the hub; when that is all that is left,
     * `active` is null and this is shown.
     */
    val toReturn: ParcelsToReturn? = null,

    /**
     * The driver's other unfinished rounds, soonest first.
     */
    val upcoming: List<UpcomingRound>,

    val upNext: List<TodayItemRef>
)

/**
 * A compact reference to the active or queued work item on the home. `hub_checkin` keeps a
 * finished collection round reachable until it is checked in.
 */
@Serializable
data class TodayItemRef (
    /**
     * Packages holding chilled or frozen goods.
     */
    val coldCount: Long? = null,

    val deliveryWindow: DeliveryWindow? = null,
    val handover: HandoverPreference? = null,
    val id: String,
    val kind: TodayItemRefKind,
    val packageCount: Long? = null,
    val place: String? = null,

    @SerialName("runId")
    val runID: String,

    val status: String,

    /**
     * What the Today card and its "Up next" rows show:
     * - `street`: a drop's street line ("12 Lygon St"), the card's title; null for a shop or
     * the hub.
     * - `place`: the rest in one line, a shop's full address or a drop's "Carlton VIC 3053".
     */
    val street: String? = null,

    val subtitle: String? = null,
    val title: String,

    /**
     * A drop's window, in the server's words, and its instants (for "Due now" / "Late").
     */
    val window: String? = null
)

@Serializable
enum class TodayItemRefKind(val value: String) {
    @SerialName("collection_stop") CollectionStop("collection_stop"),
    @SerialName("delivery_drop") DeliveryDrop("delivery_drop"),
    @SerialName("hub_checkin") HubCheckin("hub_checkin");
}

@Serializable
enum class DriverPhase(val value: String) {
    @SerialName("collection") Collection("collection"),
    @SerialName("delivery") Delivery("delivery"),
    @SerialName("idle") Idle("idle");
}

/**
 * How far through the current round the driver is. Counts only.
 */
@Serializable
data class TodayProgress (
    val delivered: Long? = null,

    /**
     * Shops collected (collection) or drops finished (delivery).
     */
    val done: Long,

    val notDelivered: Long? = null,

    /**
     * Collection: packages picked up so far / still to pick up.
     */
    val packagesInVan: Long? = null,

    val packagesToLoad: Long? = null,
    val total: Long
)

/**
 * A round the driver holds besides the current one.
 */
@Serializable
data class UpcomingRound (
    val deadlineAt: String,
    val dueLabel: String,
    val kind: DriverRunType,

    /**
     * `null` = open now.
     */
    val opening: RoundOpening? = null,

    val packageCount: Long,

    @SerialName("runId")
    val runID: String,

    val stopCount: Long
)

@Serializable
data class VehicleCheckEntry (
    val answer: VehicleCheckAnswer,
    val item: VehicleCheckItem,
    val note: String? = null
)

@Serializable
enum class VehicleCheckAnswer(val value: String) {
    @SerialName("minor") Minor("minor"),
    @SerialName("ok") Ok("ok"),
    @SerialName("unsafe") Unsafe("unsafe");
}

/**
 * The six things a driver checks before taking the vehicle out.
 */
@Serializable
enum class VehicleCheckItem(val value: String) {
    @SerialName("body") Body("body"),
    @SerialName("brakes") Brakes("brakes"),
    @SerialName("cold_storage") ColdStorage("cold_storage"),
    @SerialName("lights") Lights("lights"),
    @SerialName("mirrors") Mirrors("mirrors"),
    @SerialName("tyres") Tyres("tyres");
}

/**
 * POST /driver/v1/vehicle-check: every item, once.
 */
@Serializable
data class VehicleCheckRequest (
    val answers: List<VehicleCheckEntry>,

    @SerialName("changeId")
    val changeID: String
)

@Serializable
data class VehicleCheckResponse (
    /**
     * `ok` | `unsafe`.
     */
    val state: String
)
