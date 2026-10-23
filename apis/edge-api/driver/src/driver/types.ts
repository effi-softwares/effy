// The app treats every status but `active` alike: only `active` can hold a session or receive work.
export type DriverStatus = "active" | "suspended" | "offboarded";
export type DutyStatus = "on_duty" | "off_duty";

export interface DriverRecord {
  id: string;
  subject: string;
  name: string;
  workEmail: string;
  /** Derived from clearances ("Every zone" / a zone name / "N zones"), or null; worded in @effy/edge-shared. */
  coverageLabel: string | null;
  vehicleType: string | null;
  vehiclePlate: string | null;
  /** The vehicle behind the open holding, its label, and today's check. */
  vehicleId?: string | null;
  vehicleLabel?: string | null;
  vehicleCheck?: "none" | "ok" | "due" | "unsafe";
  status: DriverStatus;
  dutyStatus: DutyStatus;
  onDutySince: string | null;
  /** null: the driver did not say when they expect to finish. */
  expectedEndAt: string | null;
}

/** No record, or not active. One kind, so the refusal never says whether someone was suspended or offboarded. */
export class DriverAccessError extends Error {
  constructor(readonly kind: "not_provisioned" | "not_active") {
    super(kind);
    this.name = "DriverAccessError";
  }
}
