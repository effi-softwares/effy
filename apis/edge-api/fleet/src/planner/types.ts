import type { ExclusionReason } from "@effy/edge-shared";

export interface PlannablePackage {
  packageId: string;
  orderNumber: string;
  shopId: string;
  shopName: string;
  /** Where to drive, never where something is. */
  address: string;
  /** Delivery stops only: the order whose snapshot holds the destination. */
  orderId: string | null;
  recipientName: string | null;
  /** A delivery wave only ever holds `effy`. */
  deliveredBy: "effy" | "courier";
  zoneId: string | null;
  zoneName: string | null;
  readySince: string;
  weightGrams: number;
  itemCount: number;
  requiresChilled: boolean;
  requiresFrozen: boolean;
  /** The window the customer was sold, as instants; null when none. Collection work uses it to pick the run. */
  windowStart: Date | null;
  windowEnd: Date | null;
  /** Delivery only: the driver who collected it, preferred so collecting and delivering are one trip. */
  collectedBy?: string | null;
}

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
  /** Today's vehicle check, when it stands in the way (`due` or `unsafe`). */
  vehicleCheck?: "ok" | "due" | "unsafe";
}

/** With `driverId: null`, nobody at all could take it. */
export interface PlannedExclusion {
  packageId: string;
  driverId: string | null;
  reason: ExclusionReason;
}

/** A round that already exists for the run or window being planned. */
export interface BucketRound {
  roundId: string;
  driverId: string;
  /** `planned` = not begun: where new work accumulates. */
  status: "planned" | "in_progress";
  /** So capacity is judged over the whole round. */
  weightGrams: number;
  /** Keyed by shop id (collection) or order id (delivery). */
  stops: ReadonlyArray<{ key: string; outstanding: boolean }>;
}

/** Before any of it is written. */
export interface WavePlan {
  kind: "collection" | "delivery";
  plannedFor: Date;
  deadlineAt: Date;
  /** Null for collection and windowless delivery. */
  windowStartAt: Date | null;
  /** driverId → packages that start a new round. */
  assignments: Map<string, PlannablePackage[]>;
  /** roundId → packages added to an existing round. */
  additions: Map<string, PlannablePackage[]>;
  unassigned: PlannablePackage[];
  /** packageId → how it was placed, in plain words ("Auto-assigned — fewest packages today (2)"). */
  notes: Map<string, string>;
  /** Set when a person made this plan; written onto each row. */
  assignedBySub?: string | null;
  /** Only for packages in `unassigned`. */
  exclusions: PlannedExclusion[];
  considered: number;
}

/** Read, never hardcoded. */
export interface PlannerSettings {
  prepBufferMin: number;
  planningLeadMin: number;
  perStopAllowanceMin: number;
  /** Minutes a parcel needs at the hub before its window (as checkout allows). */
  hubTurnaroundMin: number;
  /** ISO weekdays with no deliveries. */
  noDeliveryWeekdays: readonly number[];
}
