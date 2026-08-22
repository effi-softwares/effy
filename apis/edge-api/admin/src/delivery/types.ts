// Domain types + refusals for the back-office delivery slice (047). Wire DTOs live in
// @effy/shared-types (delivery-admin.ts); these are the service/repository domain shapes and the typed
// refusals the handler maps to problem+json.

export type DeliveryErrorCode =
  | "invalid_plan"
  | "plan_incomplete"
  | "plan_not_found"
  | "ring_not_found"
  | "duplicate_name"
  | "invalid_zone"
  | "zone_not_found"
  | "postcode_in_zone"
  | "unknown_postcode"
  | "hub_not_set";

// DeliveryError carries a machine `code` (→ the problem `type` URI) so the console can tell an
// incomplete plan from a duplicate name from a bad value — different things for an operator to fix.
export class DeliveryError extends Error {
  constructor(
    public readonly code: DeliveryErrorCode,
    message: string,
    public readonly detail?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "DeliveryError";
  }
}

export type RingStatus = "active" | "disabled";

export interface Ring {
  id: string;
  code: string;
  name: string;
  ordinal: number;
  suggestUpperKm: string | null;
  status: RingStatus;
}

export interface NewRing {
  code: string;
  name: string;
  ordinal: number;
  suggestUpperKm: string | null;
}

export interface RingPrice {
  ringId: string;
  priceAmount: string;
}

export interface WeightBand {
  upperGrams: number;
  addAmount: string;
}

export interface FeePlan {
  id: string;
  name: string;
  isActive: boolean;
  roundingStep: string;
  floorAmount: string;
  capAmount: string;
  sameDayFactor: string;
  standardFactor: string;
  ringPrices: RingPrice[];
  weightBands: WeightBand[];
  activatedBy: string | null;
  activatedAt: string | null;
}

export interface NewFeePlan {
  name: string;
  roundingStep: string;
  floorAmount: string;
  capAmount: string;
  sameDayFactor: string;
  standardFactor: string;
  ringPrices: RingPrice[];
  weightBands: WeightBand[];
}

// ── Zones & serviceability (047) ──────────────────────────────────────────────────────────────────

export type ZoneStatus = "active" | "disabled";

export interface Zone {
  id: string;
  code: string;
  name: string;
  ringId: string;
  ringIsOverridden: boolean;
  suggestedRingId: string | null;
  hubDistanceKm: string | null;
  samedayEligible: boolean;
  status: ZoneStatus;
  postcodeCount: number;
}

export interface NewZone {
  code: string;
  name: string;
  ringId: string;
}

export interface ZonePatch {
  name?: string;
  ringId?: string;
  samedayEligible?: boolean;
  status?: ZoneStatus;
}

export interface PlaceRef {
  name: string;
  state: string;
  postcode: string;
}

// PostcodeCheck is the pre-add disclosure (FR-008/009/010): every place the postcode makes serviceable,
// whether it is unknown to the place record, and whether another zone already holds it.
export interface PostcodeCheck {
  postcode: string;
  places: PlaceRef[];
  placeCount: number;
  unknownPostcode: boolean;
  inZoneCode: string | null;
}

// RemovalImpact is what stops being serviceable when a postcode is removed (FR-011).
export interface RemovalImpact {
  postcode: string;
  places: PlaceRef[];
  placeCount: number;
}

export interface RingSuggestion {
  ringId: string | null;
  hubDistanceKm: string | null;
  reason: "ok" | "no_coordinate";
}

export interface Settings {
  hubLatitude: string;
  hubLongitude: string;
  samedayPrepBufferMin: number;
}
