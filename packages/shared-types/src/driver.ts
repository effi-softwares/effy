/**
 * Driver app contracts (`/driver/v1/*`); the app's Kotlin types are generated from these. A driver runs a
 * collection run (shops → hub), checks in at the hub, then runs a delivery run (hub → customers) closed
 * with proof. Two rules are structural:
 *  1. No monetary field anywhere: every number is a count, typed `WireInt`.
 *  2. No driver identifier in any request: scope comes from the access token's subject.
 */

// A wire integer; the definition lives in cart.ts.
import type { WireInt } from "./cart";
import type { HandoverPreference } from "./delivery-instructions";
import type { DeliveryWindow } from "./delivery-window";
import type { LabelReadDTO, ParcelDTO, ParcelHandover, ParcelMissing } from "./parcels";

// Identity and duty

export type DriverDutyStatus = "on_duty" | "off_duty";

/**
 * What the driver is driving, for their Account screen, read from their open vehicle holding. Both
 * fields are null when they hold no vehicle.
 */
export interface DriverVehicle {
  type: string | null;
  plate: string | null;
}

/** GET /driver/v1/me: the record-backed identity. Display strings only. */
export interface DriverMeDTO {
  id: string;
  name: string;
  workEmail: string;
  /**
   * What the driver is cleared to cover, as one line (Today, Help, Account), derived from their
   * clearances. Null when cleared for nothing, which the app renders as unavailable.
   */
  zone: string | null;
  hub: string | null;
  vehicle: DriverVehicle;
  dutyStatus: DriverDutyStatus;
  /** Today's pre-trip vehicle check: `due` until answered (no work until then), `unsafe` until a dispatcher clears it, `none` with no vehicle. */
  vehicleCheck?: DriverVehicleCheckState | null;
}

/** The state of the driver's vehicle check today. */
export interface DriverVehicleCheckState {
  /** `due` | `ok` | `unsafe` | `none`, a string on the wire; the app treats an unknown value as `ok`. */
  state: string;
  /** "Toyota HiAce · ABC123", for the check screen's title. */
  vehicleLabel: string | null;
}

/** The six things a driver checks before taking the vehicle out. */
export type VehicleCheckItem = "tyres" | "lights" | "brakes" | "mirrors" | "cold_storage" | "body";
export type VehicleCheckAnswer = "ok" | "minor" | "unsafe";
export const VEHICLE_CHECK_ITEMS: readonly VehicleCheckItem[] = ["tyres", "lights", "brakes", "mirrors", "cold_storage", "body"];
export const VEHICLE_CHECK_WORDS: Record<VehicleCheckItem, string> = {
  tyres: "Tyres",
  lights: "Lights and indicators",
  brakes: "Brakes",
  mirrors: "Mirrors and windows",
  cold_storage: "Cold storage",
  body: "Body damage",
};

export interface VehicleCheckEntry {
  item: VehicleCheckItem;
  answer: VehicleCheckAnswer;
  note?: string | null;
}

/** POST /driver/v1/vehicle-check: every item, once. */
export interface VehicleCheckRequest {
  changeId: string;
  answers: VehicleCheckEntry[];
}
export interface VehicleCheckResponse {
  /** `ok` | `unsafe`. */
  state: string;
}

/** POST /driver/v1/duty */
export interface DutyRequest {
  onDuty: boolean;
  changeId: string;
  /**
   * "I have seen what I am carrying and I am going off duty anyway." Going off duty with packages in the
   * van is refused (409, naming every package) until this is set: a shift cannot end silently on goods.
   */
  acknowledgeHeldPackages?: boolean;
  /**
   * When the driver expects to finish, if they say; absence means unknown. Never defaulted to a shift
   * length: a guess would decide someone's workload as if it were a fact.
   */
  expectedEndAt?: string | null;
}
export interface DutyResponse {
  dutyStatus: DriverDutyStatus;
  since: string | null;
  /** null: the driver did not say. Render as "unknown", never as a time. */
  expectedEndAt: string | null;
}

// Today

export type DriverPhase = "collection" | "delivery" | "idle";

/** A compact reference to the active or queued work item on the home. `hub_checkin` keeps a finished collection round reachable until it is checked in. */
export interface TodayItemRef {
  kind: "collection_stop" | "delivery_drop" | "hub_checkin";
  id: string;
  runId: string;
  title: string;
  subtitle: string | null;
  status: string;
  /**
   * What the Today card and its "Up next" rows show:
   * - `street`: a drop's street line ("12 Lygon St"), the card's title; null for a shop or the hub.
   * - `place`: the rest in one line, a shop's full address or a drop's "Carlton VIC 3053".
   */
  street?: string | null;
  place?: string | null;
  packageCount?: WireInt;
  /** Packages holding chilled or frozen goods. */
  coldCount?: WireInt;
  /** A drop's window, in the server's words, and its instants (for "Due now" / "Late"). */
  window?: string | null;
  deliveryWindow?: DeliveryWindow | null;
  handover?: HandoverPreference | null;
}

/** How far through the current round the driver is. Counts only. */
export interface TodayProgress {
  /** Shops collected (collection) or drops finished (delivery). */
  done: WireInt;
  total: WireInt;
  delivered?: WireInt;
  notDelivered?: WireInt;
  /** Collection: packages picked up so far / still to pick up. */
  packagesInVan?: WireInt;
  packagesToLoad?: WireInt;
}

/**
 * The run map, decorative: where a run's stops roughly are, for a small schematic. A stop's point is its
 * postcode's place (never a geocoded address or a device position); the hub's is its own. Nothing that
 * orders or assigns work reads it. Stops with no point are left out.
 */
export interface RunMapPoint {
  lat: number;
  lng: number;
}
export interface RunMapStop {
  /** The stop's number in the run's list; null for the hub. */
  n: WireInt | null;
  kind: "shop" | "customer" | "hub";
  status: "done" | "next" | "todo";
  point: RunMapPoint;
}
export interface RunMapDTO {
  /** In route order: a collection run ends at the hub, a delivery run starts there. */
  stops: RunMapStop[];
  /** The hub's point, where "Navigate to the hub" goes. */
  hub: RunMapPoint | null;
}

/** GET /driver/v1/today */
export interface TodayDTO {
  phase: DriverPhase;
  activeRunId: string | null;
  active: TodayItemRef | null;
  upNext: TodayItemRef[];
  remainingCount: WireInt;
  /**
   * When the current round opens; `null` means open (or none). Work is assigned as soon as a driver can
   * take it; its actions are refused until it opens (409 `round_not_open`, with `opensAt` and
   * `opensLabel` as field issues).
   */
  opening: RoundOpening | null;
  /** What dispatch changed on the current round while under way ("Added 2 drops"); null when nothing. Shown until dismissed. */
  changedNote?: string | null;
  /** Progress through the current round, and its map. */
  progress?: TodayProgress | null;
  map?: RunMapDTO | null;
  /** The current round's deadline; `null` only with no current round. */
  deadlineAt: string | null;
  /** The deadline in words, Melbourne time ("2 pm", "tomorrow 11 am"). */
  dueLabel: string | null;
  /** The driver's other unfinished rounds, soonest first. */
  upcoming: UpcomingRound[];
  /** The current round's parcels still to return to the hub; when that is all that is left, `active` is null and this is shown. */
  toReturn?: ParcelsToReturn | null;
  /** The current run's stage (`RunStage`) and its words ("Collecting 2 of 5"). */
  stage?: string | null;
  stageLabel?: string | null;
  /** The current run is an open delivery run not yet loaded: loading is next, `active` is null, and no drop can be done before it. */
  loadStep?: LoadStep | null;
}

/** "Load the van": the run, and what goes in it. */
export interface LoadStep {
  runId: string;
  packageCount: WireInt;
  dropCount: WireInt;
}

/** When a round opens. Sent only for a round not yet open (the server judges by its own clock), so a wrong phone clock cannot lock an open round. */
export interface RoundOpening {
  /** The instant, ISO 8601, which the app's clock is compared with to unlock by itself. */
  at: string;
  /** The same moment in words, Melbourne time. The app never formats a time. */
  label: string;
}

/** A round the driver holds besides the current one. */
export interface UpcomingRound {
  runId: string;
  kind: "collection" | "delivery";
  /** `null` = open now. */
  opening: RoundOpening | null;
  deadlineAt: string;
  dueLabel: string;
  stopCount: WireInt;
  packageCount: WireInt;
}

// Collection run. A stop is a shop within a run, holding one package per order at that shop, collected
// in one action. `stopId` is the shop id scoped to the run.

export type CollectionStopStatus = "assigned" | "en_route" | "collected" | "short";

export interface CollectionStopSummary {
  stopId: string;
  sequence: WireInt;
  shopName: string;
  shopCode: string;
  /**
   * The shop's address for the device's maps app (never a position). Null when not yet recorded, which
   * back-office readiness reports; the driver is told it is missing.
   */
  address: string | null;
  packageCount: WireInt;
  /** The stop's live bags, each with its own code ("Bag n of N"), for matching a scan offline. */
  parcels: ParcelDTO[];
  status: CollectionStopStatus;
}

/** GET /driver/v1/collection/runs/{runId}. */
export interface DriverCollectionRunDTO {
  runId: string;
  status: string;
  stops: CollectionStopSummary[];
  /** When this round opens; `null` = open. */
  opening: RoundOpening | null;
  /** When collecting must be finished. */
  deadlineAt: string;
  dueLabel: string;
  /** Where each package goes at the hub, in the platform's words, so the hub scan can say it offline. */
  hubSort: HubSortInstruction[];
  /** The run map. */
  map?: RunMapDTO | null;
  /** The run's stage and its words. */
  stage?: string | null;
  stageLabel?: string | null;
}

/** One package's hub instruction. `label` is the whole line: "LOAD NOW · Today 4–6 pm". */
export interface HubSortInstruction {
  packageCode: string;
  /** Every bag of this package: each scanned at the hub gets this instruction. */
  parcelCodes: string[];
  /** `load_now` | `shelve` | `courier_bay` (`HubSortKind`), a string on the wire so a new kind cannot break the read; an unknown kind shows the label. */
  kind: string;
  label: string;
}

export type HubSortKind = "load_now" | "shelve" | "courier_bay";

export type PackageMethod = "same_day" | "standard";

/** How an item must be carried, in the driver's words (the catalogue's `ambient` is shown "Normal"). */
export type TemperatureClass = "frozen" | "chilled" | "normal";

/** Units in the bag per class, counting only supplied lines. Every field is present; clients omit zeros. */
export interface ClassSummary {
  frozen: WireInt;
  chilled: WireInt;
  normal: WireInt;
}

export interface ManifestLine {
  name: string;
  /** The quantity in the bag: what the shop gathered (less than `orderedQty` when part-supplied, 0 when not supplied). */
  qty: WireInt;
  orderedQty: WireInt;
  /** False when the shop supplied none of this line. Shown as "not included", never hidden. */
  included: boolean;
  temperatureClass: TemperatureClass;
}

export interface CollectionPackage {
  /** The package's own id, as `CollectRequest.packages[].packageId` names it. */
  packageId: string;
  /** The code on this package's label (`EFY1:<code>`): bag 1's. */
  packageCode: string;
  /** The package's live bags ("Bag n of N"); every step accounts for every bag. */
  parcels: ParcelDTO[];
  ref: string;
  destinationSuburb: string;
  /** Who takes it from the hub: an Effy driver or a courier. */
  deliveredBy: "effy" | "courier";
  /** The day and window an Effy parcel is for, in the server's words; null when none. */
  windowLabel?: string | null;
  /** This package's own lines. */
  items: ManifestLine[];
  summary: ClassSummary;
}

/** GET /driver/v1/collection/runs/{runId}/stops/{stopId}: a shop stop and its packages. */
export interface CollectionStopDTO {
  stopId: string;
  shopName: string;
  shopCode: string;
  /** See `CollectionStopSummary.address`. */
  address: string | null;
  packages: CollectionPackage[];
  status: CollectionStopStatus;
  /** When this stop's round opens; `null` = open. Collecting is refused before then. */
  opening: RoundOpening | null;
}

/** POST /driver/v1/collection/runs/{runId}/stops/{stopId}/collect: collect this shop's packages. */
/** How a package was handed over: scanned from its label, its code typed (a torn label), or ticked by hand. */
export type HandoverMethod = "scan" | "typed" | "manual";

/** Which hand-over: shop → driver, driver → hub, hub → van, van → door, failed parcel → hub. */
export type HandoverStep = "collect" | "checkin" | "load" | "deliver" | "return";

/**
 * What every hand-over sends: each bag handed over (and how), each bag declared missing (with a reason),
 * and every read at the step, refused ones included. A live bag left unaccounted for is 409
 * `parcels_unaccounted` (`ParcelsUnaccountedProblem`).
 */
export interface ParcelStepFields {
  parcels?: ParcelHandover[];
  missingParcels?: ParcelMissing[];
  reads?: LabelReadDTO[];
}

/** The 409 when a live bag was neither handed over nor declared missing. */
export interface ParcelsUnaccountedProblem {
  type: "parcels_unaccounted";
  detail: string;
  parcels: Array<{ code: string; seq: WireInt; of: WireInt }>;
}

export interface CollectRequest extends ParcelStepFields {
  changeId: string;
  /**
   * Every package the driver was shown at this stop, with its outcome, in one request. Only what is
   * named is settled: an unnamed package stays waiting and the stop stays open (`CollectResponse.remaining`).
   */
  packages: Array<{
    packageId: string;
    outcome: "picked_up" | "not_available";
    note?: string | null;
  }>;
}
export interface CollectResponse {
  status: "collected";
  /** How many were collected and declared not available by this call. */
  collected?: WireInt;
  notAvailable?: WireInt;
  /** Packages on the stop this request did not name (added meanwhile); when above 0 the stop stays open and the app re-reads it. */
  remaining?: WireInt;
}

/** POST /driver/v1/collection/runs/{runId}/stops/{stopId}/issue: report a missing or short package. */
export interface CollectionIssueRequest {
  shopFulfillmentId?: string;
  kind: "missing" | "short";
  note?: string;
  changeId: string;
}

// Hub check-in

/** POST /driver/v1/hub/checkin */
export interface HubCheckinRequest extends ParcelStepFields {
  runId: string;
  changeId: string;
}
export interface HubCheckinResponse {
  scannedTotal: WireInt;
  /** Parcels a courier takes from the hub. */
  courierCount: WireInt;
  /**
   * Parcels Effy delivers, in all and by the day and window each waits for; the driver classifies
   * nothing. `label` is written by the server ("Today, 4 pm – 6 pm"). A parcel sold no window has null
   * instants.
   */
  effyCount: WireInt;
  effyGroups: HubCheckinEffyGroup[];
  /** When the courier next collects from the hub, in the server's words; null when no courier parcel or no service. */
  nextCourierPickupLabel?: string | null;
  /** Packages declared not in the van at this check-in, now held for dispatch. */
  held?: WireInt;
}

/** The Effy parcels of one check-in that wait for one day and window. */
export interface HubCheckinEffyGroup {
  /** yyyy-mm-dd (Melbourne) of the window; null for a parcel sold no window. */
  date: string | null;
  windowStart: string | null;
  windowEnd: string | null;
  label: string;
  count: WireInt;
  /** Sold a day with no time. */
  anyTime?: true;
  /** True when these go out today (loaded for a delivery round); false means shelved for a later day. Decided by the server. */
  dueToday: boolean;
}

// Delivery run

export type DeliveryDropStatus =
  | "staged"
  | "out_for_delivery"
  | "en_route"
  | "arrived"
  | "delivered"
  | "failed";

export interface DeliveryDropSummary {
  dropId: string;
  sequence: WireInt;
  orderRef: string;
  customerSuburb: string;
  packageCount: WireInt;
  /** The drop's live bags ("Bag n of N"), for matching a scan offline. */
  parcels: ParcelDTO[];
  /** The window as a ready-made label, e.g. "5 pm – 7 pm" (Melbourne time). */
  window: string | null;
  /** The same window as instants, so the app can say Due and Late as the clock moves. */
  deliveryWindow?: DeliveryWindow | null;
  status: DeliveryDropStatus;
  /** The drop's total across its packages, so cold goods show in the list. */
  summary: ClassSummary;
  /** The street line, for the run list ("5 Faraday St"); null when the address has none. */
  street?: string | null;
  /** When and how a finished drop was finished: the proof method or the failure reason. */
  completedAt?: string | null;
  proofMethod?: ProofMethod | null;
  failureReason?: DeliveryFailureReason | null;
}

/** GET /driver/v1/delivery/runs/{runId}. */
export interface DeliveryRunDTO {
  runId: string;
  status: string;
  drops: DeliveryDropSummary[];
  /** When this round opens; `null` = open. */
  opening: RoundOpening | null;
  /** The end of the delivery window, or of the day where there is none. */
  deadlineAt: string;
  dueLabel: string;
  /** Parcels from failed drops on this run, still with the driver, to be checked back in at the hub; `null` when none. */
  toReturn: ParcelsToReturn | null;
  /** The run map. */
  map?: RunMapDTO | null;
  /** The run's stage and its words. */
  stage?: string | null;
  stageLabel?: string | null;
}

/** What a driver still has to bring back to the hub from a delivery run's failed drops. */
export interface ParcelsToReturn {
  runId: string;
  count: WireInt;
  /** Order numbers only: no address, no customer. */
  orders: string[];
  /** Each parcel for the Return to hub screen: its ref, where it was for and why it came back. */
  parcels: ReturnParcel[];
}

export interface ReturnParcel {
  ref: string;
  packageCode: string;
  /** The package's live bags ("Bag n of N"); every step accounts for every bag. */
  parcels: ParcelDTO[];
  /** "8 Scotchmer St, Fitzroy North". */
  place: string | null;
  reason: DeliveryFailureReason | null;
}

/** POST /driver/v1/delivery/runs/{runId}/return. */
export interface ParcelReturnRequest extends ParcelStepFields {
  changeId: string;
}

/** POST /driver/v1/delivery/runs/{runId}/load: the van is loaded; every staged drop goes out. */
export interface LoadRequest extends ParcelStepFields {
  changeId: string;
}

/** Why a package did not go in the van. `other` needs a note. */
export type MissingReason = "not_at_hub" | "damaged" | "wrong_temperature" | "other";

export interface LoadResponse {
  /** How many drops this call moved to out for delivery. */
  loaded: WireInt;
  /** Packages taken off the run as not loaded, and drops removed because nothing was left. */
  held?: WireInt;
  dropsRemoved?: WireInt;
}
export interface ParcelReturnResponse {
  /** How many parcels this call returned; 0 when nothing was left to return. */
  returned: WireInt;
  /** True when the run is now finished. */
  roundComplete: boolean;
}

/**
 * One physical package at a drop, in a stable order the app labels by position ("Package 1 of 2"). A
 * package is one shop's portion, so it carries no shop id, name or code, and never may.
 */
export interface DropPackageRef {
  ref: string;
  /** The code on this package's label (`EFY1:<code>`): bag 1's. */
  packageCode: string;
  /** The package's live bags ("Bag n of N"); every step accounts for every bag. */
  parcels: ParcelDTO[];
  fromShopCount: WireInt;
  items: ManifestLine[];
  summary: ClassSummary;
}

/** GET /driver/v1/delivery/drops/{dropId}. */
export interface DeliveryDropDTO {
  dropId: string;
  orderRef: string;
  customerName: string;
  addressFull: string;
  /** The customer's note to the driver, verbatim plain text; null when they wrote none. */
  instructions: string | null;
  /**
   * How the customer asked for the order to be handed over, or null. A request, not a constraint: the
   * app says it and leads the proof chooser with it, but never removes a way of completing the drop.
   */
  handover?: HandoverPreference | null;
  /** The window the customer was sold. Due and late are derived by the app from the clock, never sent. */
  deliveryWindow?: DeliveryWindow | null;
  /** The same window as a ready-made label in Melbourne time ("5 pm – 7 pm"), so the app never formats a time. */
  window?: string | null;
  packages: DropPackageRef[];
  status: DeliveryDropStatus;
  /** The sum of `packages[].summary`. */
  summary: ClassSummary;
  /** When this drop's round opens; `null` = open. Every action is refused before then. */
  opening: RoundOpening | null;
  /**
   * The customer's checkout phone, for calling from the door: sent only while the drop is open and only
   * to the round's own driver; never in history or run lists.
   */
  customerPhone?: string | null;
  /** The van has been loaded with this drop; until then nothing on it can be done. */
  loaded?: boolean;
}

/** POST /driver/v1/delivery/drops/{dropId}/status. */
export interface DropStatusRequest {
  /** `out_for_delivery` is written only by loading the van. */
  to: "en_route" | "arrived";
  changeId: string;
}
export interface DropStatusResponse {
  status: DeliveryDropStatus;
}

export type ProofMethod = "photo" | "code" | "signature" | "contactless";

/** POST /driver/v1/delivery/drops/{dropId}/proof/presign. */
export interface ProofPresignRequest {
  contentType: string;
  fileSize: WireInt;
  changeId: string;
}
export interface ProofPresignResponse {
  uploadUrl: string;
  mediaKey: string;
}

/** POST /driver/v1/delivery/drops/{dropId}/proof. */
export interface ProofRequest {
  method: ProofMethod;
  mediaKey?: string;
  code?: string;
  note?: string;
  changeId: string;
  /** Every bag of the drop, handed over or declared missing (`ParcelStepFields`). */
  parcels?: ParcelHandover[];
  missingParcels?: ParcelMissing[];
  reads?: LabelReadDTO[];
}
export interface ProofResponse {
  status: "delivered";
}

export type DeliveryFailureReason =
  | "nobody_home"
  | "wrong_address"
  | "customer_refused"
  | "access_blocked"
  | "other";

/** POST /driver/v1/delivery/drops/{dropId}/fail. */
export interface DropFailRequest {
  reason: DeliveryFailureReason;
  note?: string;
  changeId: string;
}
export interface DropFailResponse {
  status: "failed";
}

// The run map rides the run reads (`RunMapDTO` above).

/** POST /driver/v1/delivery/drops/{dropId}/contact: masked relay (capability-flagged). */
export interface ContactRequest {
  mode: "call" | "message";
  changeId: string;
}
export interface ContactResponse {
  maskedChannel: string;
}

// History and activity

export interface HistoryDropRow {
  dropId: string;
  orderRef: string;
  customerSuburb: string;
  completedAt: string;
  proofCaptured: boolean;
  /** The street line, how it was handed over, and for a drop that came back, why. */
  street?: string | null;
  proofMethod?: ProofMethod | null;
  /** Set for a drop that was not delivered (its parcels went back to the hub). */
  failureReason?: DeliveryFailureReason | null;
}
/**
 * The two kinds of work a driver run can be (back-office reads it too). Work is typed tasks, not roles:
 * one driver often runs a collection round and then a delivery round in a shift.
 */
export type DriverRunType = "collection" | "delivery";

export interface HistoryRunRow {
  runId: string;
  type: DriverRunType;
  completedAt: string | null;
  stopCount: WireInt;
  /** Packages on the run, and a delivery run's window in words. */
  packageCount?: WireInt;
  window?: string | null;
}
export interface HistoryDay {
  date: string;
  runs: HistoryRunRow[];
  drops: HistoryDropRow[];
}
/** GET /driver/v1/history. */
export interface HistoryDTO {
  days: HistoryDay[];
}

export interface TimelineEntry {
  status: string;
  at: string;
}
/** GET /driver/v1/history/{kind}/{id}. */
export interface HistoryDetailDTO {
  timeline: TimelineEntry[];
  proof: {
    method: ProofMethod;
    mediaUrl: string | null;
    note: string | null;
    capturedAt: string;
  } | null;
  addressFull: string | null;
  packages: DropPackageRef[];
  /** For a run: its stops in order, each with how it ended. Absent for a drop. */
  stops?: HistoryStop[];
  /** A run's map (every stop done), and its window in words. */
  map?: RunMapDTO | null;
  window?: string | null;
  /** A drop's packages, and the window it was sold. */
  packageCount?: WireInt;
  orderRef?: string | null;
  /** Why a drop came back to the hub. */
  failureReason?: DeliveryFailureReason | null;
}

/** One stop of a finished run, as History lists it. No money, no customer name. */
export interface HistoryStop {
  stopId: string;
  sequence: WireInt;
  kind: "shop" | "drop" | "hub";
  /** The shop's name, the drop's street and suburb, or "Hub check-in". */
  title: string;
  status: "done" | "skipped";
  completedAt: string | null;
  proofMethod: ProofMethod | null;
  /** Why a drop came back to the hub. */
  failureReason?: DeliveryFailureReason | null;
}

// Back-office fleet management (/fleet/v1/*). Back-office only: not in the driver app's generated
// contract. As above, no money and every count is `WireInt`. A driver's phone, emergency contact and
// licence reference appear on the profile type only, never on a list, exception, duty or history type.

/**
 * Employment lifecycle. `suspended` is a temporary stand-down (no access, restorable); `offboarded` is
 * permanent (retained for audit).
 */
export type DriverEmploymentStatus = "active" | "suspended" | "offboarded";

/** The name the driver app's `/driver/v1/me` uses; the same three values. */
export type DriverStatus = DriverEmploymentStatus;

/**
 * Why a driver cannot be given work: an enumerated cause, since the fix differs per cause. The console's
 * `BLOCKED_LABEL` is a `Record` over this (a missing key would render a blank reason), and
 * `model.test.ts` asserts it is exhaustive.
 */
export type DriverBlockedReason =
  | "suspended"
  | "offboarded"
  | "licence_expired"
  | "no_vehicle"
  | "vehicle_non_compliant"
  /** Cleared for nothing: the remedy is to grant a clearance. */
  | "no_capabilities";

/** Whether the platform record and the sign-in account agree. `record_only` / `identity_only` mean
 *  provisioning half-succeeded, which the profile must show. */
export type DriverAccountState = "ok" | "record_only" | "identity_only";

export type DriverDutyState = "on_duty" | "off_duty";

// Register

/** One row of the register. Carries no contact detail. */
export interface AdminDriverListItem {
  id: string;
  name: string;
  workEmail: string;
  /** Breadth of clearance: a summary, never the full set. */
  capabilitySummary: DriverCapabilitySummary;
  dutyState: DriverDutyState;
  status: DriverEmploymentStatus;
  /** Empty when the driver can receive work; causes are shown inline. */
  blockedReasons: DriverBlockedReason[];
}

export interface AdminDriverListResponse {
  items: AdminDriverListItem[];
  /** Must be used by the UI, or the list silently stops at the first page. */
  nextCursor: string | null;
}

// Profile of record

export interface AdminDriverCredentials {
  licenceReference: string | null;
  licenceExpiresOn: string | null;
  /** Australian licence class, so "may this driver drive this vehicle" is checked rather than assumed. */
  licenceClass: DriverLicenceClass | null;
}

export type DriverLicenceClass = "C" | "LR" | "MR" | "HR";

export interface AdminDriverEmergencyContact {
  name: string | null;
  phone: string | null;
}

/** The full profile: the only type here carrying contact details. */
export interface AdminDriverProfile {
  id: string;
  name: string;
  workEmail: string;
  contactPhone: string | null;
  hub: string | null;
  vehicle: DriverVehicle;
  credentials: AdminDriverCredentials;
  emergencyContact: AdminDriverEmergencyContact;
  status: DriverEmploymentStatus;
  statusReason: string | null;
  statusChangedAt: string;
  startedOn: string | null;
  notes: string | null;
  dutyState: DriverDutyState;
  blockedReasons: DriverBlockedReason[];
  /** Everything this driver is cleared for. */
  capabilities: DriverCapability[];
  accountState: DriverAccountState;
  /** The optimistic-concurrency token: a PATCH echoes what it loaded; a stale one is a named 409. */
  updatedAt: string;
}

export interface AdminDriverCreateRequest {
  name: string;
  workEmail: string;
  contactPhone?: string | null;
  // A new driver starts cleared for nothing and holding no vehicle: both are granted deliberately afterwards.
  licenceReference?: string | null;
  licenceExpiresOn?: string | null;
  licenceClass?: DriverLicenceClass | null;
  emergencyContactName?: string | null;
  emergencyContactPhone?: string | null;
  startedOn?: string | null;
  notes?: string | null;
}

/**
 * Absent is not null: an absent key leaves the column alone, a key present with `null` clears it.
 * `workEmail` is absent: it is the identity key, so changing it is re-provisioning, not an edit.
 */
export interface AdminDriverUpdateRequest {
  name?: string;
  contactPhone?: string | null;
  // Clearances and vehicles have their own routes.
  licenceReference?: string | null;
  licenceExpiresOn?: string | null;
  licenceClass?: DriverLicenceClass | null;
  emergencyContactName?: string | null;
  emergencyContactPhone?: string | null;
  startedOn?: string | null;
  notes?: string | null;
  /** Required: the `updatedAt` the profile was loaded with. */
  updatedAt: string;
}

export interface AdminDriverStatusRequest {
  status: DriverEmploymentStatus;
  reason: string;
}

// Duty

export interface OnDutyDriver {
  driverId: string;
  driverName: string;
  /** Derived from clearances; null when cleared for nothing. */
  zone: string | null;
  sessionId: string;
  onDutySince: string;
  /** null: the driver did not say when they expect to finish. Render "unknown", never a default shift length. */
  expectedEndAt: string | null;
  /** An expected finish has already passed: visible, not alarming. */
  pastExpectedEnd: boolean;
  /** The session has been open longer than the configured threshold. */
  overdue: boolean;
}

/** Ready work with no driver. */
export interface UnassignedWorkSummary {
  readyToCollect: WireInt;
  readyToDeliver: WireInt;
  driversOnDuty: WireInt;
}

export interface DutyResponseAdmin {
  onDuty: OnDutyDriver[];
  unassigned: UnassignedWorkSummary;
}

// `DriverAuditEntry` is the back-office change log (`admin.audit_log`): who edited, stood down or restored a driver, and why.

// Clearances and coverage. Back-office only (not in the driver contract); a driver sees only the
// derived `DriverMeDTO.zone` line.

/** A grant is (function, area): who delivers a parcel is decided by the order, not by the driver's clearance. */
export type CapabilityFunction = "collection" | "delivery";

/**
 * One grant: this driver may do this kind of work in this place. `zoneId: null` means every zone,
 * including zones created later.
 */
export interface DriverCapability {
  id: string;
  function: CapabilityFunction;
  /** null = every zone. */
  zoneId: string | null;
  /** null for an every-zone grant; the console renders that label from `zoneId === null`. */
  zoneName: string | null;
  grantedAt: string;
}

export interface DriverCapabilityListResponse {
  items: DriverCapability[];
}

/** `zoneId` is required and may be `null` (everywhere), so "everywhere" is never "forgot to choose". */
export interface GrantCapabilityRequest {
  function: CapabilityFunction;
  zoneId: string | null;
}

/** Breadth of clearance for the register: a summary, so a paged list carries no unbounded array. */
export interface DriverCapabilitySummary {
  total: WireInt;
  coversEveryZone: boolean;
  functions: CapabilityFunction[];
}

/** Why a zone cannot be served: an administrative gap or a rostering problem, which have different remedies. */
export type CoverageGapReason = "no_driver_cleared" | "all_cleared_unavailable";

export interface CoverageGap {
  zoneId: string;
  zoneName: string;
  function: CapabilityFunction;
  reason: CoverageGapReason;
  /** 0: grant somebody a clearance. More than 0: the people who have it cannot work today (see readiness). */
  clearedDriverCount: WireInt;
}

/** A list of problems, not a matrix: a covered (area, function) emits no row. */
export interface CoverageResponse {
  gaps: CoverageGap[];
}

// Vehicles. Back-office only (a driver sees the vehicle they hold through `DriverVehicle`). No money and
// no coordinates.

export type VehicleBodyType = "van" | "ute" | "truck_light" | "car" | "motorcycle" | "bicycle";
export type VehicleFuelType = "petrol" | "diesel" | "hybrid" | "electric" | "none";
export type VehicleOwnership = "effy_owned" | "driver_owned";

/** `off_road` is temporary (the vehicle comes back); `retired` is terminal (the record survives for
 *  history). */
export type VehicleStatus = "active" | "off_road" | "retired";

/** Which compliance item has lapsed: derived on read from the three expiry dates, never stored. */
export type VehicleComplianceIssue =
  | "registration_expired"
  | "insurance_expired"
  | "roadworthy_expired";

/** One row of the register, with `complianceIssues` so roadworthiness shows without opening a record. */
export interface VehicleListItem {
  id: string;
  registrationPlate: string;
  make: string;
  model: string;
  bodyType: VehicleBodyType;
  ownership: VehicleOwnership;
  canCarryChilled: boolean;
  canCarryFrozen: boolean;
  status: VehicleStatus;
  currentHolderDriverId: string | null;
  currentHolderName: string | null;
  complianceIssues: VehicleComplianceIssue[];
}

export interface VehicleListResponse {
  items: VehicleListItem[];
  /** Must be used by the UI, or the list silently stops at the first page. */
  nextCursor: string | null;
}

/** One period a driver had a vehicle. */
export interface VehicleHolding {
  id: string;
  driverId: string;
  driverName: string;
  startedAt: string;
  /** null = still held. */
  endedAt: string | null;
  odometerStartKm: WireInt | null;
  odometerEndKm: WireInt | null;
  note: string | null;
}

export interface VehicleDetail extends VehicleListItem {
  year: WireInt | null;
  fuelType: VehicleFuelType | null;
  payloadKg: WireInt | null;
  loadVolumeLitres: WireInt | null;
  crateCapacity: WireInt | null;
  registrationExpiresOn: string | null;
  insurancePolicyReference: string | null;
  insuranceExpiresOn: string | null;
  roadworthyExpiresOn: string | null;
  odometerKm: WireInt | null;
  statusReason: string | null;
  notes: string | null;
  createdAt: string;
  /** Optimistic-concurrency token; a PATCH echoes what it loaded. */
  updatedAt: string;
  /** Newest first. */
  holdings: VehicleHolding[];
}

export interface VehicleCreateRequest {
  registrationPlate: string;
  make: string;
  model: string;
  bodyType: VehicleBodyType;
  ownership: VehicleOwnership;
  year?: WireInt | null;
  fuelType?: VehicleFuelType | null;
  payloadKg?: WireInt | null;
  loadVolumeLitres?: WireInt | null;
  crateCapacity?: WireInt | null;
  canCarryChilled?: boolean;
  canCarryFrozen?: boolean;
  registrationExpiresOn?: string | null;
  insurancePolicyReference?: string | null;
  insuranceExpiresOn?: string | null;
  roadworthyExpiresOn?: string | null;
  odometerKm?: WireInt | null;
  notes?: string | null;
}

/**
 * Presence, not value: a key present with `null` clears the field, an absent key leaves it. Do not drop
 * nulls from this object on the way out.
 */
export type VehicleUpdateRequest = Partial<VehicleCreateRequest> & { updatedAt: string };

export interface VehicleStatusRequest {
  status: VehicleStatus;
  reason: string;
}

export interface HoldingIssueRequest {
  driverId: string;
  odometerStartKm?: WireInt | null;
  note?: string | null;
}

export interface HoldingReturnRequest {
  odometerEndKm?: WireInt | null;
  note?: string | null;
}

// Audit

export interface DriverAuditEntry {
  id: string;
  actorSub: string;
  action: string;
  /** Never a phone, emergency contact or licence reference: a redacted field is recorded as changed and nothing more. */
  detail: Record<string, unknown>;
  at: string;
}

export interface DriverAuditResponse {
  items: DriverAuditEntry[];
}

// Readiness

export interface BlockedDriver {
  driverId: string;
  driverName: string;
  reasons: DriverBlockedReason[];
}

export interface ZoneCoverage {
  zoneId: string;
  zoneName: string;
  activeDrivers: WireInt;
}

export type ExpiringCredentialKind = "licence" | "vehicle_registration";

export interface ExpiringCredential {
  driverId: string;
  driverName: string;
  kind: ExpiringCredentialKind;
  expiresOn: string;
  expired: boolean;
}

export interface FleetReadinessResponse {
  blocked: BlockedDriver[];
  uncoveredZones: ZoneCoverage[];
  expiring: ExpiringCredential[];
}
