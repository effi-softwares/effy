// Driver domain types (049). Wire shapes live in @effy/shared-types (driver.ts); these are the
// internal domain model the repository maps rows into and never leak past the data layer.

// ⚠ WIDENED BY 056. 049 modelled a driver as active-or-disabled; back-office driver management
// separates "temporarily stood down" from "no longer employed" because the register is unusable
// for either while they are the same value. The driver app treats all three identically — only
// `active` can hold a session or receive work — but the type must admit them or it lies.
export type DriverStatus = "active" | "suspended" | "offboarded";
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

/** Raised when a driver-pool token has no provisioned record, or the record is not active. Both are
 *  refused (Principle IV) — a valid token never overrides the record.
 *
 *  ⚠ `disabled` became `not_active` in 056: the kind names the REASON FOR REFUSAL, and with three
 *  employment states there is more than one way to not be active. It stays ONE kind rather than two,
 *  because the refusal a driver sees must not disclose whether they were suspended or offboarded —
 *  that is between them and their employer, not something an app tells them at a login screen. */
export class DriverAccessError extends Error {
  constructor(readonly kind: "not_provisioned" | "not_active") {
    super(kind);
    this.name = "DriverAccessError";
  }
}
