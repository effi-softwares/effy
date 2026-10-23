/**
 * Driver app contracts — 049-driver-mobile-app.
 *
 * The wire shapes the driver mobile app exchanges with the cold-path driver service (`/driver/v1/*`).
 * DTO SSOT (Principle II): the driver app's Kotlin types are generated from these, never hand-defined.
 *
 * Hub-and-spoke model (CLAUDE.md "Driver logistics model"): a driver runs a COLLECTION run
 * (shops → hub), CHECKS IN at the hub (the same-day/standard split, known from checkout), then runs a
 * SAME-DAY DELIVERY run (hub → customers) closed with proof. Standard packages leave the app at hub
 * check-in.
 *
 * Two rules encoded structurally rather than left to handler discipline:
 *  1. NO monetary field appears in ANY type here — the driver never sees currency (FR-013). Every
 *     number on the wire is a COUNT, typed `WireInt` so the wire carries an integer, never `1.0`
 *     (the 027 R13 lesson, pinned by a Go/Node↔Kotlin contract test).
 *  2. NO driver identifier appears in any REQUEST — a driver's scope is resolved server-side from the
 *     access token's subject, so cross-driver access is un-representable on the wire (FR-012, SC-008).
 *
 * Contract detail: specs/049-driver-mobile-app/contracts/driver-api.contract.md
 */

// A wire integer (no decimal point on the wire) — the single definition lives in cart.ts.
import type { WireInt } from "./cart";
import type { HandoverPreference } from "./delivery-instructions";
import type { DeliveryWindow } from "./delivery-window";
import type { LabelReadDTO, ParcelDTO, ParcelHandover, ParcelMissing } from "./parcels";

// ── Identity & duty ──────────────────────────────────────────────────────────────────────────────

export type DriverDutyStatus = "on_duty" | "off_duty";

/**
 * What the driver is currently driving, for their own Account screen.
 *
 * ⚠ THE SHAPE IS UNCHANGED BY 061 AND THAT IS DELIBERATE — `apps/driver-mobile` renders it
 * (`DriverMappers.kt`, `AccountScreen.kt`) and it is part of the generated Kotlin contract. What
 * changed is where it COMES FROM: until 061 these were two free-text columns on the driver row that
 * nobody maintained; they are now read from the driver's open `vehicle_holding` and the real vehicle
 * behind it. The app shows a true answer without a single line of Kotlin changing.
 *
 * Both fields are null when the driver holds no vehicle, which is an ordinary state.
 */
export interface DriverVehicle {
  type: string | null;
  plate: string | null;
}

/** GET /driver/v1/me — the record-backed identity read. Display strings only; no currency. */
export interface DriverMeDTO {
  id: string;
  name: string;
  workEmail: string;
  /**
   * What the driver is cleared to cover, as one line for their own Account screen.
   *
   * ⚠ THE SHAPE IS UNCHANGED BY 062 AND THAT IS DELIBERATE — `apps/driver-mobile` renders it in three
   * places (Today, Help, Account) and it is part of the generated Kotlin contract. What changed is
   * where it COMES FROM: until 062 this was a single assigned zone that no assignment code ever read;
   * it is now DERIVED from the driver's clearances. The app tells the truth without a line of Kotlin
   * changing — the same move 061 made for `DriverVehicle`.
   *
   * null when the driver is cleared for nothing, which is an ordinary state for a new starter and one
   * the app already renders as unavailable rather than as a broken row.
   */
  zone: string | null;
  hub: string | null; // display label of the central hub (from delivery_settings)
  vehicle: DriverVehicle;
  dutyStatus: DriverDutyStatus;
  /**
   * 093 — today's pre-trip check of the vehicle the driver holds. `due` until it is answered (the
   * driver is given no work until then), `unsafe` until a dispatcher clears it, `none` with no vehicle.
   */
  vehicleCheck?: DriverVehicleCheckState | null;
}

/** 093 — the state of the driver's vehicle check today. */
export interface DriverVehicleCheckState {
  /** `due` | `ok` | `unsafe` | `none` — a string on the wire; the app treats an unknown value as `ok`. */
  state: string;
  /** "Toyota HiAce · ABC123", for the check screen's title. */
  vehicleLabel: string | null;
}

/** 093 — the six things a driver checks before taking the vehicle out. */
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

/** POST /driver/v1/vehicle-check — 093. Every item, once. */
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
   * ⚠ 064, FR-018 — "I have seen what I am carrying and I am going off duty anyway."
   *
   * Going off duty with packages still in the van is REFUSED (409) until this is set, and the refusal
   * names every package. It is a confirmation, not a bypass: the requirement is that a shift cannot
   * end SILENTLY on a van with goods in it, not that it cannot end at all — a driver whose van is
   * genuinely empty, or who handed over some other way, says so and goes home.
   *
   * 056 found that standing a driver down could strand physical goods permanently and invisibly: the
   * release sweep deliberately never reclaims picked-up work, so nothing else would ever mention it.
   */
  acknowledgeHeldPackages?: boolean;
  /**
   * ⚠ OPTIONAL, AND ITS ABSENCE MEANS UNKNOWN (061, FR-032/FR-033).
   *
   * When a driver goes on duty they may say when they expect to finish. It buys nothing today — it
   * exists so the dispatch slice can ask "can this driver finish this round before they go home",
   * which is otherwise unanswerable.
   *
   * ⚠ IT MUST NEVER BE DEFAULTED TO A SHIFT LENGTH. An invented finish time would make a guess look
   * like a fact at exactly the moment it decides someone's workload — and the driver would be the
   * one who found out.
   */
  expectedEndAt?: string | null;
}
export interface DutyResponse {
  dutyStatus: DriverDutyStatus;
  since: string | null; // ISO 8601; null when off duty
  /** null = the driver did not say. Render as "unknown", never as a time. */
  expectedEndAt: string | null;
}

/** ⚠ `LocationRequest` STOOD HERE AND IS GONE (061) — see the note below. */
// ⚠ `LocationRequest` STOOD HERE AND IS GONE (061, FR-035/FR-036). Effy does not track driver
// position. It was a receiver with no sender — no caller in `apps/driver-mobile`, no location
// permission declared on either platform, no reader of the columns — and leaving it dormant is how
// 059's `device_token.platform` came to contradict the live contract for two years.

// ── Today (phase-aware home) ─────────────────────────────────────────────────────────────────────

export type DriverPhase = "collection" | "same_day_delivery" | "idle";

/**
 * A compact reference to the active/queued work item shown on the home.
 *
 * ⚠ `"hub_checkin"` ADDED BY 064, AND IT FIXES A LIVE DEFECT. A collection round's work did not end
 * at its last shop — the load still has to be checked in at the hub — but the hub had no
 * representation here, so `todayView`'s outstanding filter emptied the moment the final shop stop
 * went `done`. Both routes into the round (the hero card, drawn from `active`, and the "Whole run"
 * link, drawn only when `upNext` is non-empty) vanished at exactly that point. Found live on
 * 2026-09-21 with a driver holding thirteen packages and no way back into their own round.
 */
export interface TodayItemRef {
  kind: "collection_stop" | "delivery_drop" | "hub_checkin";
  id: string;
  runId: string;
  title: string; // shop name or customer suburb — no address detail, no currency
  subtitle: string | null;
  status: string;
  /**
   * 092 rev 2 — what the Today card and its "Up next" rows show (the redesign's canvas). All optional:
   * a server without them leaves the card as it was.
   * - `street`: a drop's street line ("12 Lygon St") — the card's title; null for a shop or the hub.
   * - `place`: the rest of the place in one line — a shop's full address, or a drop's "Carlton VIC 3053".
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

/** 092 rev 2 — how far through the current round the driver is. Counts, never money. */
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
 * 092 rev 2 — the RUN MAP (decorative, operator direction 2026-10-17, decision D25): where a run's stops
 * roughly are, so the app can draw a small schematic map. ⚠ A STOP'S POINT IS ITS POSTCODE'S PLACE —
 * the locality the platform already holds — never a geocoded address and never a device position; the
 * hub's is the hub's own. Nothing that orders or assigns work reads it (D20 stands). Stops whose place
 * has no point are left out.
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
  /** The hub's point — also where "Navigate to the hub" goes. */
  hub: RunMapPoint | null;
}

/** GET /driver/v1/today */
export interface TodayDTO {
  phase: DriverPhase;
  activeRunId: string | null;
  active: TodayItemRef | null;
  upNext: TodayItemRef[];
  remainingCount: WireInt; // stops/drops remaining today — a count, never currency
  /**
   * 072 — when the current round OPENS. `null` means it is open (or there is none).
   *
   * ⚠ WORK IS NOW GIVEN OUT THE MOMENT A DRIVER CAN TAKE IT, hours before it can be done. A round is
   * readable from the moment it is assigned and its actions are refused until it opens — by the
   * platform (a 409 problem of type `round_not_open`, carrying `opensAt` and `opensLabel` as field
   * issues), not merely hidden by the app.
   */
  opening: RoundOpening | null;
  /**
   * 092 — what dispatch changed on the current round while it was under way ("Added 2 drops"), in their
   * words; null when nothing has changed. Shown on Today until the driver dismisses it.
   */
  changedNote?: string | null;
  /** 092 rev 2 — progress through the current round, and its map. */
  progress?: TodayProgress | null;
  map?: RunMapDTO | null;
  /** 072 — the current round's deadline. `null` only when there is no current round. */
  deadlineAt: string | null;
  /** 072 — the deadline in words, Melbourne time ("2 pm", "tomorrow 11 am"). */
  dueLabel: string | null;
  /**
   * 072 — the driver's OTHER unfinished rounds, soonest first. Until 072 a driver was told about one
   * round at a time because rounds only existed for the last 45 minutes before they were due.
   */
  upcoming: UpcomingRound[];
  /**
   * 088 — the current round's parcels still to return to the hub. When that is the only work left
   * on it, `active` is `null` and this is what the driver is shown.
   */
  toReturn?: ParcelsToReturn | null;
  /** 093 — the current run's stage (`RunStage`) and the same in words ("Collecting 2 of 5"). */
  stage?: string | null;
  stageLabel?: string | null;
  /**
   * 093 — the current run is a delivery run that is open and not loaded: loading is the next step, and
   * `active` is null. Nothing on a drop can be done before it.
   */
  loadStep?: LoadStep | null;
}

/** 093 — "Load the van": the run, and what goes in it. */
export interface LoadStep {
  runId: string;
  packageCount: WireInt;
  dropCount: WireInt;
}

/**
 * 072 — when a round opens. ⚠ ONLY EVER SENT FOR A ROUND THAT HAS NOT OPENED: the server decides
 * "is it open" against its own clock and sends `null` once it is, so a phone whose clock is wrong
 * cannot show an open round as locked.
 */
export interface RoundOpening {
  /** The instant, ISO 8601 — what the app's clock is compared with to unlock by itself. */
  at: string;
  /** The same moment in words, Melbourne time. The app never formats a time. */
  label: string;
}

/** 072 — a round the driver holds besides the current one. Readable in full; a count here. */
export interface UpcomingRound {
  runId: string;
  kind: "collection" | "same_day_delivery";
  /** `null` = open now. */
  opening: RoundOpening | null;
  deadlineAt: string;
  dueLabel: string;
  stopCount: WireInt; // shops or drops — the hub is not counted
  packageCount: WireInt;
}

// ── Phase 1 — collection run ─────────────────────────────────────────────────────────────────────
//
// A STOP is a shop within a run — it may hold several packages (one per order at that shop). The stop
// is the unit the driver collects in one action. `stopId` is the shop id scoped to the run.
// ⚠ The `shop` table stores no street address (deliberately minimal, 007), so a stop shows the shop
// NAME + CODE only; a `shop.address` column is a recorded follow-up (FR-013's "address").

export type CollectionStopStatus = "assigned" | "en_route" | "collected" | "short";

export interface CollectionStopSummary {
  stopId: string; // the shop id within this run
  sequence: WireInt;
  shopName: string;
  shopCode: string;
  /**
   * ⚠ ADDED BY 063, AND IT RETIRES A PLACEHOLDER. `collection/data/PlaceholderData.kt` declares
   * `stopAddress = operational("`shop.address`")` — an invented value a driver could act on, so the
   * app renders it as unavailable. 061 built `shop.address_*`; this carries it, and the unblocking
   * condition that placeholder names is now met.
   *
   * ⚠ AN ADDRESS, NEVER A POSITION (D20/D21). The app hands this to the device's own maps app
   * (D7 — per stop, not per route). No coordinate exists to send.
   *
   * Nullable because a shop whose address has not been recorded yet is an ordinary state the
   * back-office readiness view already reports (061 FR-029/030) — and a driver must be told the
   * address is missing rather than shown an empty line.
   */
  address: string | null;
  packageCount: WireInt;
  /** 089 — the codes printed on this stop's package labels, for matching a scan with no signal. */
  packageCodes?: string[];
  /**
   * 096 — the package's live BAGS, each with its own code ("Bag n of N"). Every step accounts for
   * every bag; `packageCode(s)` is bag 1's code and stays for reading old labels.
   */
  parcels?: ParcelDTO[];
  status: CollectionStopStatus;
}

/** GET /driver/v1/collection/runs/{runId} (driver-facing; distinct from 047's admin CollectionRunDTO) */
export interface DriverCollectionRunDTO {
  runId: string;
  status: string;
  stops: CollectionStopSummary[];
  /** 072 — when this round opens; `null` = open. */
  opening: RoundOpening | null;
  /** 072 — the collection run's time: when collecting must be finished. */
  deadlineAt: string;
  dueLabel: string;
  /**
   * 090 — where each package on this run goes at the hub, in the platform's words, so the hub scan
   * can say it with no signal. Optional: absent from an older server.
   */
  hubSort?: HubSortInstruction[];
  /** 092 rev 2 — the run map. */
  map?: RunMapDTO | null;
  /** 093 — the run's stage and its words. */
  stage?: string | null;
  stageLabel?: string | null;
}

/** 090 — one package's hub instruction. `label` is the whole line: "LOAD NOW · Today 4–6 pm". */
export interface HubSortInstruction {
  packageCode: string;
  /** 096 — the codes of every bag of this package: each bag scanned at the hub gets this instruction. */
  parcelCodes?: string[];
  /**
   * `load_now` | `shelve` | `courier_bay` (`HubSortKind`). ⚠ A STRING ON THE WIRE, NOT AN ENUM: the
   * driver app decodes enums as closed sets, and a fourth kind added later would fail the whole run
   * read on every installed build. The app maps an unknown kind to "show the label".
   */
  kind: string;
  label: string;
}

export type HubSortKind = "load_now" | "shelve" | "courier_bay";

export type PackageMethod = "same_day" | "standard";

/**
 * How an item must be carried (065). The driver-facing vocabulary, NOT the catalogue's: the
 * catalogue says `ambient`, a driver is shown "Normal".
 *
 * ⚠ `not_recorded` IS NOT A SYNONYM FOR `normal`. It is a line sold before 065 snapshotted the
 * class, and nobody knows what it was. Showing it as Normal would tell a driver a frozen item can
 * ride in the ambient compartment — the exact harm the class exists to prevent (065 FR-010).
 */
export type TemperatureClass = "frozen" | "chilled" | "normal" | "not_recorded";

/**
 * Units IN THE BAG per class (065). Counts only lines the shop actually supplied — a line marked
 * unavailable is in no bucket. Every field is always present; a client omits a zero when rendering.
 */
export interface ClassSummary {
  frozen: WireInt;
  chilled: WireInt;
  normal: WireInt;
  notRecorded: WireInt;
}

export interface ManifestLine {
  name: string;
  /**
   * ⚠ The quantity IN THE BAG (065) — what the shop gathered, which is less than `orderedQty` when
   * the line was part-supplied and 0 when it was not supplied at all. Until 065 this was the
   * quantity ordered, so a driver's count disagreed with the bag whenever a shop was short.
   */
  qty: WireInt;
  orderedQty: WireInt;
  /** False when the shop supplied none of this line. Shown as "not included", never hidden. */
  included: boolean;
  temperatureClass: TemperatureClass;
}

export interface CollectionPackage {
  /**
   * The package's own id — what `CollectRequest.packages[].packageId` names. ⚠ Until this was on the
   * wire the app could not say WHICH package a report was about, so it sent none and the whole stop
   * was marked unavailable. Optional only so an app built against it still reads an older server.
   */
  packageId?: string;
  /** 089 — the code printed on this package's label (`EFY1:<code>`). Optional for older servers. */
  packageCode?: string;
  /**
   * 096 — the package's live BAGS, each with its own code ("Bag n of N"). Every step accounts for
   * every bag; `packageCode(s)` is bag 1's code and stays for reading old labels.
   */
  parcels?: ParcelDTO[];
  ref: string; // the order number the package belongs to
  destinationSuburb: string;
  /** @deprecated 082 — routing, never shown. Read `deliveredBy`. Kept for driver builds that predate it (E9). */
  method: PackageMethod;
  /** 082 — who takes it from the hub: an Effy driver, or a courier. What the app says. */
  deliveredBy?: "effy" | "courier";
  /** 082 — the day and window an Effy parcel is for, in words written by the server; null when none. */
  windowLabel?: string | null;
  /**
   * ⚠ THIS PACKAGE'S OWN LINES (065). Until 065 every package at a stop carried every line at the
   * stop, so three packages of 2, 5 and 1 items each read "8 items".
   */
  items: ManifestLine[];
  summary: ClassSummary;
}

/** GET /driver/v1/collection/runs/{runId}/stops/{stopId} — a shop stop and its packages. */
export interface CollectionStopDTO {
  stopId: string;
  shopName: string;
  shopCode: string;
  /** ⚠ See `CollectionStopSummary.address` — added by 063, retires the `stopAddress` placeholder. */
  address: string | null;
  packages: CollectionPackage[];
  status: CollectionStopStatus;
  /** 072 — when this stop's round opens; `null` = open. Collecting is refused before then. */
  opening: RoundOpening | null;
}

/** POST /driver/v1/collection/runs/{runId}/stops/{stopId}/collect — collect this shop's packages. */
/**
 * 090 — how a package was handed over: scanned from its label, its code typed (a torn label), or
 * ticked by hand. Optional on every hand-over; an app that sends none behaves as before.
 */
export type HandoverMethod = "scan" | "typed" | "manual";

/** 090 — which hand-over: shop → driver, driver → hub, hub → van, van → door, failed parcel → hub. */
export type HandoverStep = "collect" | "checkin" | "load" | "deliver" | "return";

/**
 * 096 — what every driver hand-over sends: each BAG handed over (and how), each bag declared missing
 * (with a reason), and every read made at the step, refused ones included. The server refuses a step
 * that leaves a live bag unaccounted for (409 `parcels_unaccounted`, `ParcelsUnaccountedProblem`).
 */
export interface ParcelStepFields {
  parcels?: ParcelHandover[];
  missingParcels?: ParcelMissing[];
  reads?: LabelReadDTO[];
}

/** 096 — the 409 a step answers when a live bag was neither handed over nor declared missing. */
export interface ParcelsUnaccountedProblem {
  type: "parcels_unaccounted";
  detail: string;
  parcels: Array<{ code: string; seq: WireInt; of: WireInt }>;
}

export interface CollectRequest extends ParcelStepFields {
  changeId: string;
  /**
   * Every package the driver was SHOWN at this stop, each with its outcome (063 FR-026: one request,
   * so it cannot half-happen).
   *
   * ⚠ 093 — REQUIRED, AND ONLY WHAT IS NAMED IS SETTLED. Until 093 an absent package meant "collected",
   * so a package added to the stop while the driver stood at the counter was recorded as in the van
   * without anybody having seen it. A package not named here stays waiting, and the stop stays open
   * (`CollectResponse.remaining`).
   */
  packages: Array<{
    packageId: string;
    outcome: "picked_up" | "not_available";
    note?: string | null;
  }>;
}
export interface CollectResponse {
  status: "collected";
  /** 093 — how many were collected and declared not available by this call. */
  collected?: WireInt;
  notAvailable?: WireInt;
  /**
   * 093 — packages on the stop this request did not name (added while the driver was there). When
   * more than 0 the stop is still open, and the app re-reads it and shows them.
   */
  remaining?: WireInt;
}

/** POST /driver/v1/collection/runs/{runId}/stops/{stopId}/issue — report a missing/short package. */
export interface CollectionIssueRequest {
  shopFulfillmentId?: string; // the specific package (order at this shop); optional
  kind: "missing" | "short";
  note?: string;
  changeId: string;
}

// ── The pivot — hub check-in ─────────────────────────────────────────────────────────────────────

/** POST /driver/v1/hub/checkin */
export interface HubCheckinRequest extends ParcelStepFields {
  runId: string;
  changeId: string;
}
export interface HubCheckinResponse {
  scannedTotal: WireInt;
  sameDayCount: WireInt;
  /** @deprecated 080 — read `courierCount`. Kept for driver builds that predate it. */
  standardCount: WireInt; // staged for the external carrier; leaves the driver's active work
  /** 080 — parcels a COURIER takes from the hub (package_delivered_by = courier). The app says "Courier". */
  courierCount?: WireInt;
  /**
   * 082 — parcels EFFY delivers, in all and by the day and window each waits for. The app shows two
   * groups, "Effy delivery" (these) and "Courier", and the driver classifies nothing.
   * ⚠ `label` is written by the server ("Today, 4 pm – 6 pm", "Thu 15 Oct, 10 am – 12 pm"): the app has
   * no timezone database and never formats a day itself. A parcel sold no window has null instants.
   * ⚠ `sameDayCount` / `standardCount` above are @deprecated — compatibility (083): kept so installed apps keep working
   * (a driver build from before 082 reads them). So are the `same_day_delivery` values of
   * `DriverPhase`, `DriverRunType` and a round's `kind`: they mean "an Effy delivery round".
   */
  effyCount?: WireInt;
  effyGroups?: HubCheckinEffyGroup[];
  /**
   * 092 — when the courier next collects from the hub, in the server's words ("4 pm", "tomorrow
   * 10 am"); null when no courier parcel was checked in or no courier service is set up.
   */
  nextCourierPickupLabel?: string | null;
  /** 093 — packages declared not in the van at this check-in, now held for dispatch. */
  held?: WireInt;
}

/** 082 — the Effy parcels of one check-in that wait for one day and window. */
export interface HubCheckinEffyGroup {
  /** yyyy-mm-dd (Melbourne) of the window; null for a parcel sold no window. */
  date: string | null;
  windowStart: string | null;
  windowEnd: string | null;
  label: string;
  count: WireInt;
  /** 085 — these were sold a day with no time. */
  anyTime?: true;
  /**
   * True when these go out TODAY (their window is today, or they were sold no window): the driver
   * loads them for a delivery round. False = shelved at the hub for a later day. ⚠ Decided by the
   * server, which knows the operating day; the app never compares dates.
   */
  dueToday: boolean;
}

// ── Phase 2 — same-day delivery run ──────────────────────────────────────────────────────────────

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
  /** 089 — the codes printed on this drop's package labels, for matching a scan with no signal. */
  packageCodes?: string[];
  /**
   * 096 — the package's live BAGS, each with its own code ("Bag n of N"). Every step accounts for
   * every bag; `packageCode(s)` is bag 1's code and stays for reading old labels.
   */
  parcels?: ParcelDTO[];
  /**
   * The delivery window as a ready-made label, e.g. "5 pm – 7 pm" (Melbourne time). ⚠ Null from 049
   * until 069 — the field existed and nothing could fill it, because no window was ever sold.
   */
  window: string | null;
  /** 069 — the same window as instants, so the app can say Due and Late as the clock moves. */
  deliveryWindow?: DeliveryWindow | null;
  status: DeliveryDropStatus;
  /** 065 — the drop's total across its packages, so cold goods show in the list unopened. */
  summary: ClassSummary;
  /** 092 rev 2 — the street line, for the run list ("5 Faraday St"); null when the address has none. */
  street?: string | null;
  /** 092 rev 2 — when a finished drop was finished, and how: the proof method or the failure reason. */
  completedAt?: string | null;
  proofMethod?: ProofMethod | null;
  failureReason?: DeliveryFailureReason | null;
}

/** GET /driver/v1/delivery/runs/{runId} */
export interface DeliveryRunDTO {
  runId: string;
  status: string;
  drops: DeliveryDropSummary[];
  /** 072 — when this round opens; `null` = open (always, for a round with no delivery window). */
  opening: RoundOpening | null;
  /** 072 — the end of the delivery window, or the end of the day where there is none. */
  deadlineAt: string;
  dueLabel: string;
  /**
   * 088 — parcels from failed drops on this run, still with the driver, to be checked back in at the
   * hub. `null` (or absent, from an older server) when there are none.
   */
  toReturn?: ParcelsToReturn | null;
  /** 092 rev 2 — the run map. */
  map?: RunMapDTO | null;
  /** 093 — the run's stage and its words. */
  stage?: string | null;
  stageLabel?: string | null;
}

/**
 * 088 — what a driver still has to bring back to the hub from a delivery run's failed drops.
 *
 * ⚠ A FIELD, NEVER A NEW `TodayItemRef.kind`. Installed driver builds decode that kind as a closed
 * enum; a new value would fail the WHOLE Today response on every one of them, and there is no
 * app-update mechanism. An unknown field is ignored by every build.
 */
export interface ParcelsToReturn {
  runId: string;
  count: WireInt;
  /** Order numbers only — no address, no customer (049 FR-013). */
  orders: string[];
  /** 090 — the label codes of the parcels to return, for the return scan. */
  packageCodes?: string[];
  /** 092 rev 2 — each parcel, for the Return to hub screen: its ref, where it was for and why it came back. */
  parcels?: ReturnParcel[];
}

export interface ReturnParcel {
  ref: string;
  packageCode: string;
  /**
   * 096 — the package's live BAGS, each with its own code ("Bag n of N"). Every step accounts for
   * every bag; `packageCode(s)` is bag 1's code and stays for reading old labels.
   */
  parcels?: ParcelDTO[];

  /** "8 Scotchmer St, Fitzroy North". */
  place: string | null;
  reason: DeliveryFailureReason | null;
}

/** POST /driver/v1/delivery/runs/{runId}/return — 088. */
export interface ParcelReturnRequest extends ParcelStepFields {
  changeId: string;
}

/** POST /driver/v1/delivery/runs/{runId}/load — 090: the van is loaded; every staged drop goes out. */
export interface LoadRequest extends ParcelStepFields {
  changeId: string;
}

/** 093 — why a package did not go in the van. `other` needs a note. */
export type MissingReason = "not_at_hub" | "damaged" | "wrong_temperature" | "other";

export const MISSING_REASON_WORDS: Record<MissingReason, string> = {
  not_at_hub: "Not at the hub",
  damaged: "Damaged",
  wrong_temperature: "Wrong temperature",
  other: "Other",
};

export interface LoadResponse {
  /** How many drops this call moved to out for delivery. */
  loaded: WireInt;
  /** 093 — packages taken off the run as not loaded, and drops removed because nothing was left. */
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
 * One physical package at a drop.
 *
 * ⚠ ONE ENTRY PER PACKAGE SINCE 065, in a stable order the app labels by POSITION ("Package 1 of
 * 2"). A package is one shop's portion, so grouping by package IS grouping by shop — which is why
 * the entry carries no shop id, name or code, and never may.
 */
export interface DropPackageRef {
  ref: string;
  /** 089 — the code printed on this package's label (`EFY1:<code>`). Optional for older servers. */
  packageCode?: string;
  /**
   * 096 — the package's live BAGS, each with its own code ("Bag n of N"). Every step accounts for
   * every bag; `packageCode(s)` is bag 1's code and stays for reading old labels.
   */
  parcels?: ParcelDTO[];
  fromShopCount: WireInt; // how many shops contributed — never shop identity
  items: ManifestLine[];
  summary: ClassSummary;
}

/** GET /driver/v1/delivery/drops/{dropId} */
export interface DeliveryDropDTO {
  dropId: string;
  orderRef: string;
  customerName: string;
  addressFull: string;
  /**
   * The customer's NOTE to the driver, verbatim (066). Null when they wrote none. ⚠ Until 066 this
   * was always null: the field existed, three screens rendered it, and nothing stored it.
   * Customer-authored free text — plain text only.
   */
  instructions: string | null;
  /**
   * 066 — how the customer asked for the order to be handed over, or null/absent for no preference.
   * ⚠ A REQUEST, not a constraint: the app says it and leads the proof chooser with it, and never
   * removes a way of completing the drop. Kept apart from `instructions` because the app ACTS on it.
   */
  handover?: HandoverPreference | null;
  /**
   * 069 — the time window the customer was sold. Null/absent for an order placed before 069.
   * ⚠ Due and late are derived by the app from this and the clock; the server does not send a
   * state that would be stale the moment the screen had been open a minute.
   */
  deliveryWindow?: DeliveryWindow | null;
  /**
   * 069 — the same window as a ready-made label in Melbourne time ("5 pm – 7 pm"), the field the run
   * list has carried since 049. Sent so the app shows the SERVER's wording and never formats a time.
   */
  window?: string | null;
  packages: DropPackageRef[];
  status: DeliveryDropStatus;
  /** 065 — the sum of `packages[].summary`. */
  summary: ClassSummary;
  /** 072 — when this drop's round opens; `null` = open. Every action on it is refused before then. */
  opening: RoundOpening | null;
  /**
   * 092 — the phone number the customer gave at checkout, for the driver to call from the door.
   * ⚠ Sent ONLY while the drop is open (not delivered, not failed) and only to the round's own driver;
   * null otherwise, or when the customer gave none. Never in history or run lists.
   */
  customerPhone?: string | null;
  /** 093 — the van has been loaded with this drop. Until it is, nothing on the drop can be done. */
  loaded?: boolean;
}

/** POST /driver/v1/delivery/drops/{dropId}/status */
export interface DropStatusRequest {
  /** 093 — `out_for_delivery` is written only by loading the van. */
  to: "en_route" | "arrived";
  changeId: string;
}
export interface DropStatusResponse {
  status: DeliveryDropStatus;
}

export type ProofMethod = "photo" | "code" | "signature" | "contactless";

/** POST /driver/v1/delivery/drops/{dropId}/proof/presign */
export interface ProofPresignRequest {
  contentType: string;
  fileSize: WireInt;
  changeId: string;
}
export interface ProofPresignResponse {
  uploadUrl: string;
  mediaKey: string;
}

/** POST /driver/v1/delivery/drops/{dropId}/proof */
export interface ProofRequest {
  method: ProofMethod;
  mediaKey?: string; // photo/signature
  code?: string; // code
  note?: string;
  changeId: string;
  /** 096 — every bag of the drop, handed over or declared missing (`ParcelStepFields`). */
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

/** POST /driver/v1/delivery/drops/{dropId}/fail */
export interface DropFailRequest {
  reason: DeliveryFailureReason;
  note?: string;
  changeId: string;
}
export interface DropFailResponse {
  status: "failed";
}

// ── Map ──────────────────────────────────────────────────────────────────────────────────────────
// ⚠ 049's `GET /driver/v1/runs/{runId}/map` types (MapPoint, MapStop, a RunMapDTO with the driver's
// `currentLocation`) were DELETED by 092 rev 2: no route served them and D22 removed device position.
// The run map now rides the run reads — `RunMapDTO` above.

/** POST /driver/v1/delivery/drops/{dropId}/contact — masked relay (capability-flagged, R6). */
export interface ContactRequest {
  mode: "call" | "message";
  changeId: string;
}
export interface ContactResponse {
  maskedChannel: string;
}

// ── History & activity ───────────────────────────────────────────────────────────────────────────

export interface HistoryDropRow {
  dropId: string;
  orderRef: string;
  customerSuburb: string;
  completedAt: string; // ISO 8601
  proofCaptured: boolean;
  /** 092 rev 2 — the street line, how it was handed over, and — for a drop that came back — why. */
  street?: string | null;
  proofMethod?: ProofMethod | null;
  /** Set for a drop that was NOT delivered (its parcels went back to the hub). */
  failureReason?: DeliveryFailureReason | null;
}
/**
 * The two kinds of work a driver run can be. Named as a type by 056 because back-office reads it too
 * — it was an inline union used once, and a second consumer is exactly when a concept earns a name
 * (Principle II: one definition per concept, not one per file).
 *
 * ⚠ Work is TYPED TASKS, NOT DRIVER ROLES. One driver typically runs a collection round and then a
 * same-day round in the same shift; neither is a role they hold.
 */
export type DriverRunType = "collection" | "same_day_delivery";

export interface HistoryRunRow {
  runId: string;
  type: DriverRunType;
  completedAt: string | null;
  stopCount: WireInt;
  /** 092 rev 2 — packages on the run, and a delivery run's window in words. */
  packageCount?: WireInt;
  window?: string | null;
}
export interface HistoryDay {
  date: string; // YYYY-MM-DD (Australia/Melbourne)
  runs: HistoryRunRow[];
  drops: HistoryDropRow[];
}
/** GET /driver/v1/history */
export interface HistoryDTO {
  days: HistoryDay[];
}

export interface TimelineEntry {
  status: string;
  at: string; // ISO 8601
}
/** GET /driver/v1/history/{kind}/{id} */
export interface HistoryDetailDTO {
  timeline: TimelineEntry[];
  proof: {
    method: ProofMethod;
    mediaUrl: string | null; // signed GET; null for code/contactless
    note: string | null;
    capturedAt: string;
  } | null;
  addressFull: string | null;
  packages: DropPackageRef[];
  /**
   * 092 — for a RUN: its stops in order, each with how it ended. Absent for a drop. ⚠ Until 092 a run's
   * detail looked its id up as a stop and was always "not found".
   */
  stops?: HistoryStop[];
  /** 092 rev 2 — a run's map (every stop done), and its window in words. */
  map?: RunMapDTO | null;
  window?: string | null;
  /** 092 rev 2 — a drop's packages, and the window it was sold. */
  packageCount?: WireInt;
  orderRef?: string | null;
  /** 092 rev 2 — why a drop came back to the hub. */
  failureReason?: DeliveryFailureReason | null;
}

/** 092 — one stop of a finished run, as History lists it. No money, no customer name. */
export interface HistoryStop {
  stopId: string;
  sequence: WireInt;
  kind: "shop" | "drop" | "hub";
  /** The shop's name, the drop's street and suburb, or "Hub check-in". */
  title: string;
  status: "done" | "skipped";
  completedAt: string | null;
  proofMethod: ProofMethod | null;
  /** 092 rev 2 — why a drop came back to the hub. */
  failureReason?: DeliveryFailureReason | null;
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// Back-office fleet management — /fleet/v1/* (056-driver-management)
// contract: specs/056-driver-management/contracts/fleet-api.contract.md
//
// ⚠ THESE TYPES ARE BACK-OFFICE-ONLY AND ARE NOT CONSUMED BY THE DRIVER APP. They live in this file
// rather than a new one because they describe the SAME entity the file above describes — Principle II
// is about one definition per concept, not one file per audience. `apps/driver-mobile` has no
// generated contract directory and no drift guard (only cm-/sm- targets exist in the Makefile), so
// nothing here regenerates Kotlin.
//
// Two rules carry over from the driver block above and are just as binding here:
//  1. NO monetary field appears anywhere (FR-049). The driver domain has never carried money and
//     back-office does not introduce it — an order's money lives on the order screens these link to.
//  2. Every count is `WireInt`, so the wire carries an integer and never `1.0`. That rule is about
//     the CONTRACT, not about who happens to read it today (the 027 R13 lesson).
//
// One rule is new, and it is about PII rather than shape:
//  3. A driver's phone, emergency contact and licence reference appear on the PROFILE type only.
//     They are absent from every list, exception, duty and history type, so a screen that shows many
//     drivers cannot leak a contact detail it never needed (FR-050).
// ═══════════════════════════════════════════════════════════════════════════════════════════════

/**
 * Employment lifecycle. ⚠ WIDENED FROM `active | disabled` BY 056.
 *
 * `suspended` is a temporary stand-down: retained, no access, no work, restorable.
 * `offboarded` is permanent: retained for audit, permanently no access.
 *
 * Conflating them — which is what `disabled` did — makes the register unusable for either, because
 * "is this person coming back?" is the only question an operator actually has about a driver who is
 * not working today.
 */
export type DriverEmploymentStatus = "active" | "suspended" | "offboarded";

/** ⚠ Retained name for the driver app's own `/driver/v1/me` payload; same three values. */
export type DriverStatus = DriverEmploymentStatus;

/** Why a driver cannot be given work. An enumerated cause, never a bare boolean — "cannot work"
 *  without "why" is not actionable, and the fix differs per cause (FR-044). */
/**
 * ⚠ NARROWED BY 062 AND WIDENED BY 061, AND EVERY READER WAS AUDITED BEFORE EACH (T010, T015).
 *
 * 062 removed `no_zone` and added `no_capabilities`. ⚠ A NARROWING IS NOT THE MIRROR OF A WIDENING:
 * removing a member makes an exhaustive `Record<>` over it OVER-specified, which TypeScript reports
 * as an excess property — so the compiler helps here too. But stored rows and test fixtures carrying
 * the removed value do NOT announce themselves and had to be found by hand.
 *
 * ⚠ ORIGINAL 061 NOTE FOLLOWS. 053, 056 and 057 each shipped a
 * defect through an enum widening, and this one is unusually sharp: the console's `BLOCKED_LABEL` is
 * a `Record<DriverBlockedReason, string>`, so a missing key renders **nothing at all** — a blocked
 * driver with a blank reason reads as "not blocked". `model.test.ts` asserts the map is exhaustive so
 * the next widening fails the suite instead of rendering silence.
 *
 * Readers at the time of widening: `apis/edge-api/fleet/src/drivers/sql.ts` (the producer),
 * `apis/edge-api/fleet/src/readiness/`, `apps/back-office/src/features/drivers/model.ts`
 * (`BLOCKED_LABEL`) and its ReadinessPanel/list fixtures.
 *
 * ⚠ `no_zone` HAS NOW BEEN REMOVED by slice B, as that note predicted.
 */
export type DriverBlockedReason =
  | "suspended"
  | "offboarded"
  | "licence_expired"
  | "no_vehicle"
  | "vehicle_non_compliant"
  /** ⚠ 062 — replaces `no_zone`. A driver cleared for nothing cannot be given work, and the remedy
   *  is to grant them a clearance rather than to assign them a zone. */
  | "no_capabilities";

/** Whether the platform record and the sign-in account agree (FR-006, spec edge case).
 *  `record_only` / `identity_only` mean provisioning half-succeeded — the profile must SHOW that
 *  rather than render a half-working driver as normal. */
export type DriverAccountState = "ok" | "record_only" | "identity_only";

export type DriverDutyState = "on_duty" | "off_duty";

// ── Register ─────────────────────────────────────────────────────────────────────────────────────

/** One row of the register (FR-002). ⚠ Deliberately carries NO contact detail (FR-050). */
export interface AdminDriverListItem {
  id: string;
  name: string;
  workEmail: string;
  /** ⚠ 062 — breadth of clearance replaces the old single zone. A SUMMARY, never the full set. */
  capabilitySummary: DriverCapabilitySummary;
  dutyState: DriverDutyState;
  status: DriverEmploymentStatus;
  /** Empty when the driver can receive work. Populated causes are shown inline (FR-044, SC-009). */
  blockedReasons: DriverBlockedReason[];
}

export interface AdminDriverListResponse {
  items: AdminDriverListItem[];
  /** ⚠ Must be consumed by the UI. 053 shipped a console that ignored its own nextCursor and was
   *  silently capped at the newest 25 rows. */
  nextCursor: string | null;
}

// ── Profile of record ────────────────────────────────────────────────────────────────────────────

export interface AdminDriverCredentials {
  licenceReference: string | null;
  licenceExpiresOn: string | null;
  /** ⚠ Australian licence class (061, FR-021). Recorded so "may this driver legally drive this
   *  vehicle" is checkable rather than assumed — a WorkSafe Victoria OHS duty. */
  licenceClass: DriverLicenceClass | null;
}

/** ⚠ `vehicleRegistrationExpiresOn` LEFT THIS TYPE in 061. A registration expiry is a fact about a
 *  VEHICLE, not about a person, and it now lives on `public.vehicle` where a second driver holding
 *  the same van reads the same date. It was on the driver row only because vehicles had no table. */
export type DriverLicenceClass = "C" | "LR" | "MR" | "HR";

export interface AdminDriverEmergencyContact {
  name: string | null;
  phone: string | null;
}

/** The full profile (FR-006). ⚠ The ONLY type here carrying contact details. */
export interface AdminDriverProfile {
  id: string;
  name: string;
  workEmail: string;
  contactPhone: string | null;
  // ⚠ `zoneId` / `zone` LEFT THIS TYPE IN 062. A driver's coverage is now a set of clearances
  // (`capabilities` below), because one zone could never express "same-day delivery here, standard
  // collection everywhere" — and because no assignment code ever read the old field.
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
  /** Everything this driver is cleared for (062, FR-007). */
  capabilities: DriverCapability[];
  accountState: DriverAccountState;
  /** The optimistic-concurrency token. A PATCH must echo the value it loaded (FR: edge case
   *  "two operators edit the same driver at once"); a stale one is refused with a named 409. */
  updatedAt: string;
}

export interface AdminDriverCreateRequest {
  name: string;
  workEmail: string;
  contactPhone?: string | null;
  // ⚠ `zoneId` LEFT THIS TYPE IN 062. A new driver starts cleared for nothing, and clearances are
  // granted deliberately afterwards — a create form that quietly assigns coverage is how somebody
  // ends up eligible for work nobody decided to give them.
  // ⚠ `vehicleType` / `vehiclePlate` / `vehicleRegistrationExpiresOn` LEFT THIS TYPE IN 061. A
  // vehicle is its own record; what a driver drives is decided by ISSUING them one, not by typing a
  // string here. A registration expiry is a fact about a vehicle, so two drivers holding the same
  // van now read the same date instead of two hand-maintained copies.
  licenceReference?: string | null;
  licenceExpiresOn?: string | null;
  licenceClass?: DriverLicenceClass | null;
  emergencyContactName?: string | null;
  emergencyContactPhone?: string | null;
  startedOn?: string | null;
  notes?: string | null;
}

/**
 * ⚠ ABSENT IS NOT NULL, and that distinction is the whole point of FR-010.
 *
 * A key absent from the request leaves the column alone. A key present with `null` CLEARS it. The
 * predecessor used `COALESCE($n, col)`, which cannot tell the two apart — so a zone, once assigned,
 * could never be un-assigned by any request the API accepted.
 *
 * ⚠ `workEmail` is deliberately absent. It is the identity key: the sign-in account is created with
 * it as the username and the platform record joins on the `sub` that account returned, so changing it
 * is a re-provisioning, not an edit (research R7).
 */
export interface AdminDriverUpdateRequest {
  name?: string;
  contactPhone?: string | null;
  // ⚠ `zoneId` LEFT THIS TYPE IN 062 — clearances are granted and revoked through their own routes,
  // not edited as a field on the profile.
  // ⚠ `vehicleType` / `vehiclePlate` / `vehicleRegistrationExpiresOn` LEFT THIS TYPE IN 061. A
  // vehicle is its own record; what a driver drives is decided by ISSUING them one, not by typing a
  // string here. A registration expiry is a fact about a vehicle, so two drivers holding the same
  // van now read the same date instead of two hand-maintained copies.
  licenceReference?: string | null;
  licenceExpiresOn?: string | null;
  licenceClass?: DriverLicenceClass | null;
  emergencyContactName?: string | null;
  emergencyContactPhone?: string | null;
  startedOn?: string | null;
  notes?: string | null;
  /** Required. The `updatedAt` the profile was loaded with. */
  updatedAt: string;
}

export interface AdminDriverStatusRequest {
  status: DriverEmploymentStatus;
  reason: string;
  // ⚠ `acknowledgeHeldWork` was here, and the dispatch slice will need it back. It gated FR-020's
  // itemised refusal when standing down a driver holding already-picked-up work; that work lived in
  // `collection_task` / `delivery_task`, so with nothing assigning anything no driver can hold any.
}

// ── Held / stranded work ─────────────────────────────────────────────────────────────────────────

// ── Stranded work and exceptions: RETIRED WITH THE WORK MODEL ───────────────────────────────────
//
// ⚠ `StrandedWork*` and `DriverException*` described rows in `collection_task`, `delivery_task`,
// `delivery_failure` and `collection_task_issue`, all dropped by
// db/migrations/20260920101500_remove_driver_work_model.sql. They are removed rather than kept as a
// dormant vocabulary, because 059 found a fourth reader of `device_token.platform` whose only sign of
// life was a comment saying web push was out of scope — exported, imported by nothing, quietly
// contradicting the live contract. A type nothing can populate is that shape waiting to happen.
//
// ⚠ THE CAPABILITY THEY SERVED IS NOT RESOLVED, ONLY UNBUILT. 056 existed because the driver app had
// been recording exceptions since 049 for a reader that did not exist — a driver marks a drop
// undeliverable and nobody at Effy is told. The dispatch slice inherits that requirement along with
// the work model it must redesign; ORDER-FLOW-GAPS.md is where it stays recorded until then.

// ── Duty ─────────────────────────────────────────────────────────────────────────────────────────

export interface OnDutyDriver {
  driverId: string;
  driverName: string;
  /** ⚠ 062 — derived from clearances, not a single assigned zone. Null when cleared for nothing. */
  zone: string | null;
  sessionId: string;
  onDutySince: string;
  /** ⚠ null = the driver did not say when they expect to finish. The console renders "unknown";
   *  it MUST NOT substitute a default shift length (061, FR-033). */
  expectedEndAt: string | null;
  /** True when an expected finish has already passed — visible, not alarming. */
  pastExpectedEnd: boolean;
  /** True when the session has been open longer than the configured threshold (FR-037). */
  overdue: boolean;
}

/**
 * Work that is ready and has no driver (FR-036).
 *
 * ⚠ THIS IS NOW A BACKLOG, NOT A SHORTFALL. It was computed with the assignment sweep's own candidate
 * predicate so the screen could not disagree with what the sweep saw; there is no sweep, nothing
 * claims work, and so every ready package counts. Until dispatch is rebuilt these figures only rise —
 * which is the one thing about the current state an operator needs to be able to see.
 */
export interface UnassignedWorkSummary {
  readyToCollect: WireInt;
  readyToDeliver: WireInt;
  driversOnDuty: WireInt;
}

export interface DutyResponseAdmin {
  onDuty: OnDutyDriver[];
  unassigned: UnassignedWorkSummary;
}

// ── Work history: RETIRED WITH THE WORK MODEL ───────────────────────────────────────────────────
//
// ⚠ `DriverRunSummary`, `DriverRunStop`, `DriverRunDetail`, `DriverPeriodSummary`,
// `DriverHistoryResponse` and `DriverProofResponse` all projected `driver_run`, `collection_task`,
// `delivery_task`, `driver_task_event` and `proof_of_delivery`. Gone with those tables.
//
// ⚠ `DriverAuditEntry` below is a DIFFERENT record and deliberately survives: it is the back-office
// change log in `admin.audit_log` — who edited a driver's profile, who stood them down and why. That
// is employment history, not work history, and nothing about it depended on the shape of a run.

// ── Clearances and coverage (062) ────────────────────────────────────────────────────────────────
//
// ⚠ BACK-OFFICE ONLY. None of these enter `driver-contract.ts`, so none reaches the generated Kotlin.
// A driver does not grant their own clearances; they see only the derived `DriverMeDTO.zone` line.

/**
 * ⚠ 082 — A GRANT IS (function, area). The old second half — "standard" or "same-day" — is gone: who
 * delivers a parcel is decided by the order (079), not by a method a driver is cleared for. A driver
 * who held either method for a function and area holds that function for that area.
 */
export type CapabilityFunction = "collection" | "delivery";

/**
 * One grant: this driver may do this kind of work in this place.
 *
 * ⚠ `zoneId: null` MEANS EVERY ZONE — including zones created afterwards. It is the single most
 * important fact in this feature, and the one whose absence would be invisible: an enumeration of
 * today's zones is correct when written and quietly wrong the first time a zone is added, with
 * nothing failing and nobody told.
 */
export interface DriverCapability {
  id: string;
  function: CapabilityFunction;
  /** ⚠ null = every zone. */
  zoneId: string | null;
  /** ⚠ null for an every-zone grant — NEVER a server-supplied "All zones" string. The label is
   *  presentation, and a second place naming the concept is a second place it can drift. The console
   *  renders it from `zoneId === null`. */
  zoneName: string | null;
  grantedAt: string;
}

export interface DriverCapabilityListResponse {
  items: DriverCapability[];
}

/**
 * ⚠ `zoneId` is REQUIRED and may be explicitly `null`. A key absent and a key present-with-null must
 * not be conflated, or "everywhere" becomes indistinguishable from "the operator forgot to choose".
 */
export interface GrantCapabilityRequest {
  function: CapabilityFunction;
  zoneId: string | null;
}

/** Breadth of clearance for the register (FR-014). ⚠ A SUMMARY, not the full set — shipping every
 *  grant would put an unbounded array on every row of a paged list. */
export interface DriverCapabilitySummary {
  total: WireInt;
  coversEveryZone: boolean;
  functions: CapabilityFunction[];
}

/** Why a zone cannot be served. ⚠ TWO REASONS, NOT ONE — an administrative gap and a rostering
 *  problem have different remedies, and collapsing them tells an operator nothing about what to do. */
export type CoverageGapReason = "no_driver_cleared" | "all_cleared_unavailable";

export interface CoverageGap {
  zoneId: string;
  zoneName: string;
  function: CapabilityFunction;
  reason: CoverageGapReason;
  /** ⚠ What makes the two reasons ACTIONABLE: 0 means grant somebody a clearance; more than 0 means
   *  the people who have it cannot work today, and the fix is in the readiness view. */
  clearedDriverCount: WireInt;
}

/**
 * ⚠ A LIST OF PROBLEMS, NOT A MATRIX. A covered (area, function) emits NO ROW at all (FR-019) — a
 * screen that lists everything and colours the bad ones is a screen an operator has to scan.
 *
 * 082 — one row per area and function; the method dimension is gone.
 */
export interface CoverageResponse {
  gaps: CoverageGap[];
}

// ── Vehicles (061) ───────────────────────────────────────────────────────────────────────────────
//
// ⚠ BACK-OFFICE ONLY. None of these enter `driver-contract.ts`, so none reaches the generated Kotlin
// and the driver app is unaffected. A driver sees the vehicle they hold through `DriverVehicle`.
//
// ⚠ NO MONEY ANYWHERE. Not a purchase price, not a lease cost, not a fuel figure. The driver domain
// has never carried currency (049 FR-013) and 061 does not introduce it.
//
// ⚠ NO COORDINATES ANYWHERE. Nothing on this platform computes distance (D20).

export type VehicleBodyType = "van" | "ute" | "truck_light" | "car" | "motorcycle" | "bicycle";
export type VehicleFuelType = "petrol" | "diesel" | "hybrid" | "electric" | "none";
export type VehicleOwnership = "effy_owned" | "driver_owned";

/** ⚠ `off_road` is NOT `retired`. Off-road is temporary and the vehicle comes back; retired is
 *  terminal and the record survives for history. Collapsing them makes "where did the van go?"
 *  unanswerable. */
export type VehicleStatus = "active" | "off_road" | "retired";

/** Which compliance item has lapsed. ⚠ DERIVED ON READ from the three expiry dates, never stored —
 *  compliance is time-dependent and a stored flag goes stale silently at midnight (027's
 *  counted-not-stored rule, fourth application). */
export type VehicleComplianceIssue =
  | "registration_expired"
  | "insurance_expired"
  | "roadworthy_expired";

/** One row of the register (FR-001, FR-009). ⚠ Carries `complianceIssues` so an operator can answer
 *  "what is roadworthy" WITHOUT opening a record. */
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
  /** ⚠ Consumed by the UI, not merely returned. 053 shipped a console silently capped at 25 rows. */
  nextCursor: string | null;
}

/** One period a driver had a vehicle (FR-016). */
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
  /** Newest first (FR-016). */
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
 * ⚠ PRESENCE, NOT VALUE — the same rule 056 established for drivers and fixed a real defect over.
 * A key present with `null` CLEARS the field; a key absent leaves it alone. `COALESCE($n, col)`
 * cannot tell those apart, which is how a zone once assigned became permanent. Do not "clean" this
 * object on the way out: dropping nulls silently restores that defect.
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

// ── Audit ────────────────────────────────────────────────────────────────────────────────────────

export interface DriverAuditEntry {
  id: string;
  actorSub: string;
  action: string;
  /** ⚠ Never carries a phone, emergency contact or licence reference — the audit writer records a
   *  redacted field as CHANGED and nothing more (FR-050). */
  detail: Record<string, unknown>;
  at: string;
}

export interface DriverAuditResponse {
  items: DriverAuditEntry[];
}

// ── Readiness ────────────────────────────────────────────────────────────────────────────────────

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
