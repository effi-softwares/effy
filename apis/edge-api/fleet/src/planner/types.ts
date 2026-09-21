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
  method: "standard" | "same_day";
  zoneId: string | null;
  zoneName: string | null;
  readySince: string;
  weightGrams: number;
  itemCount: number;
  requiresChilled: boolean;
  requiresFrozen: boolean;
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
    method: "standard" | "same_day";
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

/** What a wave decided, before any of it is written. */
export interface WavePlan {
  kind: "collection" | "delivery";
  plannedFor: Date;
  deadlineAt: Date;
  /** driverId → the packages that driver should take. */
  assignments: Map<string, PlannablePackage[]>;
  /** Packages that joined a round already under way (FR-004a). stopId → packages. */
  lateJoins: Map<string, PlannablePackage[]>;
  unassigned: PlannablePackage[];
  exclusions: PlannedExclusion[];
  considered: number;
}

/** The planner's configuration. ⚠ Read, never hardcoded (research R11). */
export interface PlannerSettings {
  prepBufferMin: number;
  planningLeadMin: number;
  perStopAllowanceMin: number;
}
