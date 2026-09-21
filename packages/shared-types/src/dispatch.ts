// 063-driver-work-assignment — the wire shapes for work assignment and wave planning.
//
// Two audiences read these: the driver app (its own work) and the back-office dispatcher console
// (everybody's). One contract, because the underlying facts are the same facts — a round is a round
// whoever is looking at it — and two contracts would drift.
//
// ⚠ NO MONEY ANYWHERE IN THIS FILE. A driver is never told what an order is worth (049 FR-013), and a
// dispatcher does not need it to move work around. There is no field to leak it through.
//
// ⚠ NO COORDINATE, DISTANCE OR TRAVEL TIME ANYWHERE IN THIS FILE (operator direction, D20/D22).
// Sequencing is an ordering problem here, not a geometry one. A stop carries an ADDRESS so a driver
// can hand off to their device's maps app (D7, per-stop not per-route) — never a position.

import type { WireInt } from "./cart";

/** Collecting from shops, or delivering to customers. Independent of method and zone. */
export type RoundKind = "collection" | "delivery";

/** The lifecycle of a body of work given to one driver. */
export type RoundStatus = "planned" | "in_progress" | "completed" | "cancelled";

/** What kind of place a stop is. */
export type StopKind = "shop_pickup" | "customer_drop" | "hub_checkin";

export type StopStatus = "pending" | "arrived" | "done" | "skipped";

/** Where one package has got to within a round. */
export type RoundPackageState = "assigned" | "picked_up" | "not_available" | "delivered" | "failed";

/**
 * Why a driver could not be given a piece of work.
 *
 * ⚠ THIS IS THE VOCABULARY THAT MAKES AN UNASSIGNED PACKAGE EXPLAINABLE (FR-015). Widening it is a
 * contract change with readers on both surfaces — 053, 056 and 057 each shipped a defect through an
 * enum widening, so audit every reader before adding a value.
 */
export type ExclusionReasonDTO =
  | "not_on_duty"
  | "not_employable"
  | "licence_expired"
  | "no_vehicle"
  | "not_cleared"
  | "no_refrigeration"
  | "over_capacity"
  | "cannot_meet_deadline";

/** One package to handle at a stop. */
export interface RoundPackageDTO {
  id: string;
  /** The shop's portion of one order — `shop_fulfillment`. */
  packageId: string;
  /** The customer-facing order reference, for a driver to read aloud. */
  orderNumber: string;
  state: RoundPackageState;
  itemCount: WireInt;
  /** ⚠ Grams, as an integer. Never a float — see `WireInt`. */
  weightGrams: WireInt;
  requiresChilled: boolean;
  requiresFrozen: boolean;
  /** Set when a driver could not take it, so the discrepancy is visible (FR-026). */
  note: string | null;
}

/** One place the driver goes. */
export interface StopDTO {
  id: string;
  kind: StopKind;
  status: StopStatus;
  /** Shop name for a pickup, a recipient label for a drop, "Hub" for check-in. */
  label: string;
  /**
   * Where to go, as a single human-readable line.
   *
   * ⚠ AN ADDRESS, NOT A POSITION. The app hands this to the device's own maps application (D7).
   * There is deliberately no latitude/longitude for a later slice to "just use".
   */
  address: string | null;
  /** The area this stop is in — what the ordering groups on. Null for the hub. */
  zoneName: string | null;
  /** When this stop must be done by, if anything constrains it. */
  dueAt: string | null;
  completedAt: string | null;
  packages: RoundPackageDTO[];
}

/** A body of work given to one driver in one go. */
export interface RoundDTO {
  id: string;
  kind: RoundKind;
  status: RoundStatus;
  deadlineAt: string;
  /**
   * ⚠ Set when a wave added work to a round already under way (FR-004b). The driver must be TOLD the
   * round changed — a round that grows silently underneath somebody working it is worse than one
   * that never grows.
   */
  changedNote: string | null;
  /** Non-null when a person has decided this assignment and the engine must not touch it (FR-032). */
  lockedBy: string | null;
  stops: StopDTO[];
}

/** The driver's own view: what to do next, already ordered (FR-017). */
export interface DriverTodayDTO {
  /**
   * ⚠ Null is an ordinary answer, not an error: an on-duty driver with nothing assigned yet. The app
   * must distinguish it from a failed request, or "no work" and "we could not ask" look identical.
   */
  round: RoundDTO | null;
  /** Rounds this driver has already finished today, newest first. */
  completedToday: RoundDTO[];
}

/** A package nobody could be given, with the reason — the dispatcher's whole job (FR-028). */
export interface UnassignedWorkDTO {
  packageId: string;
  orderNumber: string;
  shopName: string;
  zoneName: string | null;
  method: "standard" | "same_day";
  readySince: string;
  /**
   * ⚠ Every reason, not the first (FR-026). A driver can be suspended AND holding a van with lapsed
   * registration; sending an operator to fix one of those wastes the trip.
   *
   * ⚠ An EMPTY array means no candidate existed at all — a different and more urgent problem than a
   * named driver failing a named condition.
   */
  reasons: ExclusionReasonDTO[];
}

/** What a planning pass did, so its decisions are explainable afterwards (FR-006). */
export interface WaveSummaryDTO {
  id: string;
  kind: RoundKind;
  plannedFor: string;
  trigger: "schedule" | "manual";
  startedAt: string;
  finishedAt: string | null;
  packagesConsidered: WireInt;
  packagesAssigned: WireInt;
  /** ⚠ The number that matters — considered 40, assigned 0 is the silent failure worth alarming on. */
  packagesUnassigned: WireInt;
}

/** One driver's line in the dispatcher's day view. */
export interface DispatchRoundSummaryDTO {
  round: RoundDTO;
  driverId: string;
  driverName: string;
  stopsRemaining: WireInt;
  packagesRemaining: WireInt;
  /** Derived on read against `deadlineAt`, never stored (027's counted-not-stored rule). */
  isLate: boolean;
}

/** The dispatcher's day. */
export interface DispatchDayDTO {
  rounds: DispatchRoundSummaryDTO[];
  unassigned: UnassignedWorkDTO[];
  waves: WaveSummaryDTO[];
}

/** Moving a round to a different driver (FR-029). */
export interface ReassignRoundInput {
  driverId: string;
  /** ⚠ Microsecond-precision `updated_at` from the round that was read — the concurrency token. */
  expectedUpdatedAt: string;
}

/** Setting a dispatcher's own order for a round's stops (FR-031). */
export interface ReorderStopsInput {
  /** Stop ids in the order the dispatcher wants them. */
  stopIds: string[];
  expectedUpdatedAt: string;
}

/** Completing a stop, with each package's outcome (FR-026). */
export interface CompleteStopInput {
  packages: Array<{
    id: string;
    /** ⚠ A package not taken must be recorded as such, never quietly omitted. */
    outcome: "picked_up" | "not_available" | "delivered" | "failed";
    note?: string | null;
  }>;
}

/** The hub check-in result — the split is shown, never decided (FR-023). */
export interface HubCheckinDTO {
  checkedInAt: string;
  packagesExpected: WireInt;
  packagesArrived: WireInt;
  /** Going back out today. */
  sameDayCount: WireInt;
  /**
   * ⚠ Leaving by other means. A standard package's driver-side work ENDS here (FR-024) — it enters no
   * delivery round.
   */
  standardCount: WireInt;
}
