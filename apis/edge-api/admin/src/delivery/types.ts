export type DeliveryErrorCode =
  | "invalid_zone"
  | "zone_not_found"
  | "postcode_in_zone"
  | "unknown_postcode"
  | "hub_not_set";

// `code` becomes the problem type, so the console can tell refusals apart.
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
  /** Set after a save that moved the hub. */
  distances?: { recomputed: number; unchanged: number; manualFlagged: number };
}
