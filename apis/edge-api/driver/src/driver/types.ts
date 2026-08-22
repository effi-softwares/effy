// Driver domain types (049). Wire shapes live in @effy/shared-types (driver.ts); these are the
// internal domain model the repository maps rows into and never leak past the data layer.

export type DriverStatus = "active" | "disabled";
export type DutyStatus = "on_duty" | "off_duty";

/** The platform's authoritative driver record (Principle IV). */
export interface DriverRecord {
  id: string;
  subject: string; // cognito_sub
  name: string;
  workEmail: string;
  zoneId: string | null;
  zoneName: string | null;
  vehicleType: string | null;
  vehiclePlate: string | null;
  status: DriverStatus;
  dutyStatus: DutyStatus;
  onDutySince: string | null; // ISO 8601; null when off duty
}

/** Raised when a driver-pool token has no provisioned record, or the record is disabled. Both are
 *  refused (Principle IV) — a valid token never overrides the record. */
export class DriverAccessError extends Error {
  constructor(readonly kind: "not_provisioned" | "disabled") {
    super(kind);
    this.name = "DriverAccessError";
  }
}
