// Domain types + refusals for the back-office delivery slice (047). Wire DTOs live in
// @effy/shared-types (delivery-admin.ts); these are the service/repository domain shapes and the typed
// refusals the handler maps to problem+json.

export type DeliveryErrorCode =
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

export interface Settings {
  hubLatitude: string;
  hubLongitude: string;
  samedayPrepBufferMin: number;
  /** 076 — set on the answer to a save that moved the hub: what it did to the coverage list's distances. */
  distances?: { recomputed: number; unchanged: number; manualFlagged: number };
}
