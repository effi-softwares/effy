// The planner's internal domain model (063). Row shapes are mapped into these at the data layer and
// never leak past it (Principle VI).

import type { ExclusionReason } from "@effy/edge-shared";

/** A package a wave may place. */
export interface PlannablePackage {
  packageId: string;
  orderNumber: string;
  shopId: string;
  shopName: string;
  /** ⚠ Where to DRIVE, never where something IS. No coordinate exists to carry (D20/D21). */
  address: string;
  /** Delivery stops only — the order whose jsonb snapshot holds the destination. */
  orderId: string | null;
  recipientName: string | null;
  /** 082 — who takes it to the customer (079's definition). A delivery wave only ever holds `effy`. */
  deliveredBy: "effy" | "courier";
  zoneId: string | null;
  zoneName: string | null;
  readySince: string;
  weightGrams: number;
  itemCount: number;
  requiresChilled: boolean;
  requiresFrozen: boolean;
  /**
   * 069 — the delivery window the customer was sold, as instants. Null for a parcel sold none: a
   * courier parcel, or an order placed before 069 (promised the day and nothing finer). Since 082
   * collection work carries it too — it decides which run the parcel travels on.
   */
  windowStart: Date | null;
  windowEnd: Date | null;
}

/** One driver the wave may give work to. */
export interface PlannerCandidate {
  driverId: string;
  driverName: string;
  status: "active" | "suspended" | "offboarded";
  onDuty: boolean;
  licenceExpiresOn: string | null;
  expectedEndAt: string | null;
  vehicle: {
    vehicleId: string;
    payloadKg: number | null;
    canCarryChilled: boolean;
    canCarryFrozen: boolean;
  } | null;
  clearances: ReadonlyArray<{
    function: "collection" | "delivery";
    zoneId: string | null;
  }>;
  packagesAssignedToday: number;
}

/** Why one package could not go to one driver — or, with `driverId: null`, to anybody at all. */
export interface PlannedExclusion {
  packageId: string;
  driverId: string | null;
  reason: ExclusionReason;
}

/**
 * A round that already exists for the run or window being planned (072).
 *
 * (073 removed the round lock, so every unfinished round for the run or window is loaded.)
 */
export interface BucketRound {
  roundId: string;
  driverId: string;
  /** `planned` = not yet begun, and the round new work accumulates in. */
  status: "planned" | "in_progress";
  /** Everything on the round, so capacity is judged over the whole of it. */
  weightGrams: number;
  /** Every stop, keyed as the planner keys them: shop id (collection) or order id (delivery). */
  stops: ReadonlyArray<{ key: string; outstanding: boolean }>;
}

/** What a pass decided for one run or window, before any of it is written. */
export interface WavePlan {
  kind: "collection" | "delivery";
  plannedFor: Date;
  deadlineAt: Date;
  /** 072 — the delivery window this plan serves; null for collection and for windowless delivery. */
  windowStartAt: Date | null;
  /** driverId → packages that start a NEW round for that driver. */
  assignments: Map<string, PlannablePackage[]>;
  /** 072 — roundId → packages added to a round that already exists. */
  additions: Map<string, PlannablePackage[]>;
  unassigned: PlannablePackage[];
  /**
   * 073 — packageId → one line on how it was placed, in plain words ("Auto-assigned — fewest packages
   * today (2)"). Written once onto the assignment; back-office shows it beside the driver.
   */
  notes: Map<string, string>;
  /** 073 — set when a PERSON made this plan (Assign to…); written onto each row it places. */
  assignedBySub?: string | null;
  /** ⚠ Only for packages in `unassigned` — a reason is a fact about work nobody has. */
  exclusions: PlannedExclusion[];
  considered: number;
}

/** The planner's configuration. ⚠ Read, never hardcoded (research R11). */
export interface PlannerSettings {
  prepBufferMin: number;
  planningLeadMin: number;
  perStopAllowanceMin: number;
  /** 082 — minutes a parcel needs at the hub before its window starts (what checkout allows too). */
  hubTurnaroundMin: number;
  /** 082 — ISO weekdays with no deliveries (069's calendar). */
  noDeliveryWeekdays: readonly number[];
}
