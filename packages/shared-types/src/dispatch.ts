// Work assignment: the wire shapes the driver app (its own work) and the dispatcher console (everyone's)
// share. No money anywhere: a driver is never told what an order is worth. No coordinate, distance or
// travel time: sequencing is ordering, and a stop carries an address for the device's maps app.

import type { WireInt } from "./cart";
import type { DeliveryFailureReason } from "./driver";
import type { DeliveryWindow } from "./delivery-window";
import type { PackageStatusView } from "./package-status";

/** Collecting from shops, or delivering to customers. */
export type RoundKind = "collection" | "delivery";

/** The lifecycle of a body of work given to one driver. */
export type RoundStatus = "planned" | "in_progress" | "completed" | "cancelled";

/** What kind of place a stop is. */
export type StopKind = "shop_pickup" | "customer_drop" | "hub_checkin";

/** Readers meaning "still to do" test for the finished states (`done`, `skipped`), not a list of open ones. */
export type StopStatus = "pending" | "out_for_delivery" | "en_route" | "arrived" | "done" | "skipped";

/** Where one package has got to within a round. */
export type RoundPackageState = "assigned" | "picked_up" | "not_available" | "delivered" | "failed";

/** Why a driver could not be given a piece of work. Readers exist on both surfaces: audit them before adding a value. */
export type ExclusionReasonDTO =
  | "not_on_duty"
  | "not_employable"
  | "licence_expired"
  | "no_vehicle"
  | "not_cleared"
  | "no_refrigeration"
  | "over_capacity"
  | "cannot_meet_deadline"
  // The driver has not checked their vehicle today, or the check found it unsafe.
  | "vehicle_check_due"
  | "vehicle_unsafe";

/** One package to handle at a stop. */
export interface RoundPackageDTO {
  id: string;
  /** The shop's portion of one order (`shop_fulfillment`). */
  packageId: string;
  /** The customer-facing order reference, for a driver to read aloud. */
  orderNumber: string;
  state: RoundPackageState;
  itemCount: WireInt;
  /** Grams, as an integer (`WireInt`). */
  weightGrams: WireInt;
  requiresChilled: boolean;
  requiresFrozen: boolean;
  /** Set when a driver could not take it, so the discrepancy is visible. */
  note: string | null;
}

/** One place the driver goes. */
export interface StopDTO {
  id: string;
  kind: StopKind;
  status: StopStatus;
  /** Shop name for a pickup, a recipient label for a drop, "Hub" for check-in. */
  label: string;
  /** Where to go, as one human-readable line: an address for the device's maps app, never a position. */
  address: string | null;
  /** The area this stop is in, which the ordering groups on. Null for the hub. */
  zoneName: string | null;
  /** When this stop must be done by, if anything constrains it. */
  dueAt: string | null;
  /** A customer drop's delivery window; null for other stops. `dueAt` is its start, so earlier windows come first. */
  deliveryWindow?: DeliveryWindow | null;
  completedAt: string | null;
  packages: RoundPackageDTO[];
}

/** A body of work given to one driver in one go. */
export interface RoundDTO {
  id: string;
  kind: RoundKind;
  status: RoundStatus;
  deadlineAt: string;
  /** When the round opens to its driver; `null` = open. Derived by the database, never stored. */
  opensAt: string | null;
  /** Set when a wave added work to a round under way: the driver must be told the round changed. */
  changedNote: string | null;
  stops: StopDTO[];
}

/** A package nobody could be given, with the reason. */
export interface UnassignedWorkDTO {
  packageId: string;
  orderNumber: string;
  shopName: string;
  zoneName: string | null;
  readySince: string;
  /** Still at its supplier after the run that would have reached the hub for its window; offered on the next run. */
  collectLate?: boolean;
  /**
   * Every reason, not the first (a driver can be suspended and hold a van with lapsed registration). An
   * empty array means no candidate existed at all, a more urgent problem.
   */
  reasons: ExclusionReasonDTO[];
  /** Where the package waits: at a shop to be collected, or at the hub to be delivered. */
  stage: "collection" | "delivery";
  /** What it waits for: its collection run, or the end of its window. `null` when no run is configured. */
  targetAt: string | null;
}

/** One driver's line in the dispatcher's day view. */
export interface DispatchRoundSummaryDTO {
  round: RoundDTO;
  driverId: string;
  driverName: string;
  stopsRemaining: WireInt;
  packagesRemaining: WireInt;
  /** Derived on read against `deadlineAt`, never stored. */
  isLate: boolean;
  /** Where the run is (`RunStage`), and the same in words. */
  stage?: string;
  stageLabel?: string;
  /** Stops or drops were finished out of plan order. Shown, never prevented. */
  outOfOrder?: boolean;
  /** A dispatcher let this run skip the cross-run gate. */
  waiver?: RoundWaiverDTO | null;
}

/** A dispatcher's permission for one run to skip the cross-run gate. */
export interface RoundWaiverDTO {
  reason: string;
  staffName: string;
  at: string;
}

/** POST /fleet/v1/dispatch/rounds/{id}/waive-sequence. */
export interface WaiveSequenceRequest {
  reason: string;
}

/** A one-line answer from a staff action. */
export interface StaffActionResponse {
  message: string;
}

/** The dispatcher's day. */
export interface DispatchDayDTO {
  rounds: DispatchRoundSummaryDTO[];
  unassigned: UnassignedWorkDTO[];
  /** Parcels from failed deliveries: still in a van, or back at the hub awaiting a person's decision. */
  failedParcels?: { withDrivers: WireInt; returnedAwaitingDecision: WireInt };
}

/** Moving a round to a different driver. */
export interface ReassignRoundInput {
  driverId: string;
  /** The round's microsecond-precision `updated_at` as read: the concurrency token. */
  expectedUpdatedAt: string;
}

/** A dispatcher's own order for a round's stops. */
export interface ReorderStopsInput {
  /** Stop ids in the order the dispatcher wants them. */
  stopIds: string[];
  expectedUpdatedAt: string;
}

// Delivery exceptions and custody (back-office). `DeliveryFailureReason` comes from `./driver`: the
// reason a dispatcher reads is the one the driver app submits.

/** A delivery that could not be completed, as back-office sees it. `packageLocation` says whether the goods are still in a van. */
export interface DeliveryExceptionDTO {
  exceptionId: string;
  stopId: string;
  orderNumber: string;
  reason: DeliveryFailureReason;
  note: string | null;
  driverId: string;
  driverName: string;
  /** Suburb only: no street address on a list screen. */
  destinationSuburb: string | null;
  failedAt: string;
  resolvedAt: string | null;
  /** Derived, never stored. */
  packageLocation: "with_driver" | "at_hub";
  /** The delivery round the drop was on, where a return is recorded on the driver's behalf. */
  roundId: string;
  /** When the parcel was checked back in at the hub; null while still with the driver. */
  returnedAt: string | null;
  /** How it ended, once dealt with. Absent from an older server; `outcome` null when closed before outcomes were recorded. */
  resolution?: DeliveryExceptionResolutionDTO | null;
}

/** POST /fleet/v1/dispatch/rounds/{roundId}/return: staff return parcels on a driver's behalf. */
export interface StaffParcelReturnRequest {
  changeId: string;
}
export interface StaffParcelReturnResponse {
  returned: WireInt;
  roundComplete: boolean;
}

/** GET /fleet/v1/exceptions */
export interface DeliveryExceptionResolutionDTO {
  outcome: ExceptionOutcome | null;
  note: string | null;
}

export interface DeliveryExceptionListDTO {
  /** One page of failed deliveries (a console list, 103). */
  exceptions: import("./list").ListPage<DeliveryExceptionDTO>;
  /** Every open one, whatever page is shown. */
  openCount: WireInt;
  /** Packages a driver declared missing at loading or check-in, still to be decided. */
  held?: HeldPackageDTO[];
  /** Runs whose next step is overdue. */
  overdue?: OverdueRunDTO[];
  /** Today's vehicle checks with something to see (a minor or unsafe answer). */
  vehicleChecks?: VehicleCheckDTO[];
}

/** A package declared missing. `step` is where: `load` (hub → van) or `checkin` (van → hub). */
export interface HeldPackageDTO {
  holdId: string;
  packageId: string;
  orderNumber: string;
  shopName: string;
  driverName: string;
  roundId: string;
  /** Every driver step can declare a bag missing (collect, check-in, load, door, return). */
  step: "collect" | "checkin" | "load" | "deliver" | "return";
  /** `not_at_shop` | `not_at_hub` | `damaged` | `wrong_temperature` | `not_in_van` | `other`. */
  reason: string;
  note: string | null;
  createdAt: string;
  /** The one bag held; null when the whole package is. Optional for older deploys. */
  parcel?: { code: string; seq: number; of: number; zone: "ambient" | "chilled" | "frozen" } | null;
}

export const HOLD_REASON_WORDS: Record<string, string> = {
  not_at_shop: "Not at the shop",
  not_at_hub: "Not at the hub",
  damaged: "Damaged",
  wrong_temperature: "Wrong temperature",
  not_in_van: "Not in the van",
  other: "Other",
};

/** POST /fleet/v1/held-packages/{holdId}/resolve. */
export interface ResolveHoldRequest {
  resolution: "found" | "lost";
}

/** A run whose next step is late: loading (delivery) or the hub check-in (collection). */
export interface OverdueRunDTO {
  roundId: string;
  kind: RoundKind;
  driverName: string;
  stage: string;
  stageLabel: string;
  /** When the step became due. */
  since: string;
  /** How late, in whole minutes, at the time of the read. */
  minutes: WireInt;
}

/** One driver's vehicle check. */
export interface VehicleCheckDTO {
  checkId: string;
  driverName: string;
  vehicleLabel: string;
  answers: Array<{ item: string; answer: string; note: string | null }>;
  unsafe: boolean;
  createdAt: string;
  clearedAt: string | null;
  clearNote: string | null;
}

/** POST /fleet/v1/vehicle-checks/{checkId}/clear. */
export interface ClearVehicleCheckRequest {
  note: string;
}

/** How a failed delivery ended. `other` needs a note. */
export type ExceptionOutcome = "redelivered" | "refunded" | "collected" | "other";
export const EXCEPTION_OUTCOMES: readonly ExceptionOutcome[] = ["redelivered", "refunded", "collected", "other"];

/** POST /fleet/v1/exceptions/{id}/resolve. */
export interface ResolveExceptionRequest {
  note?: string;
  /** Optional for an older client; back-office always sends it. */
  outcome?: ExceptionOutcome;
  changeId: string;
}
export interface ResolveExceptionResponse {
  exceptionId: string;
  resolvedAt: string;
}

// Dispatch across the days on sale

/** A day with delivery windows on sale, today first. */
export interface DispatchCalendarDayDTO {
  /** yyyy-mm-dd, Melbourne. */
  date: string;
  /** "Today" / "Wed 14 Oct". */
  label: string;
  isToday: boolean;
}

/** One Effy parcel sold a window on the chosen day. */
export interface DispatchWindowParcelDTO {
  packageId: string;
  orderId: string;
  orderNumber: string;
  /** Where it is, in the nine status words. */
  status: PackageStatusView;
  /** Still at its supplier after the run that would have made its window. */
  collectLate: boolean;
  /** Holds chilled or frozen items and was checked in at the hub before its window's day. */
  coldOvernight: boolean;
  /** The postcode group its address is in; null when in none. */
  group: string | null;
}

/** One window on the chosen day, with its parcels and its round. */
export interface DispatchWindowDTO {
  windowStart: string;
  windowEnd: string;
  /** "Wed 14 Oct, 4 pm – 6 pm", or "Wed 14 Oct · Any time (12 pm – 9 pm)" for the Any time window. */
  label: string;
  /** The "Any time" window: its parcels were sold the day, not these hours. */
  anyTime?: true;
  /** The window's delivery rounds. Empty before its day: rounds are planned on their own day, so later parcels are waiting, not unassigned. */
  rounds: { roundId: string; driver: { id: string; name: string }; opensAt: string | null; parcels: WireInt }[];
  parcels: DispatchWindowParcelDTO[];
}

/** `GET /fleet/v1/dispatch/windows?date=` */
export interface DispatchWindowsResponse {
  days: DispatchCalendarDayDTO[];
  date: string;
  windows: DispatchWindowDTO[];
}
