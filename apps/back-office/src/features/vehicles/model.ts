import type {
  VehicleBodyType,
  VehicleComplianceIssue,
  VehicleFuelType,
  VehicleOwnership,
  VehicleStatus,
} from "@effy/shared-types";

// Screen-facing vocabulary for the vehicle register (061). The wire shapes come from
// @effy/shared-types; this file holds the console's own copy and query shapes.

export interface VehicleListParams {
  status?: VehicleStatus | "";
  refrigeration?: "chilled" | "frozen" | "";
  nonCompliantOnly?: boolean;
  cursor?: string;
}

export const BODY_TYPE_LABEL: Record<VehicleBodyType, string> = {
  van: "Van",
  ute: "Ute",
  truck_light: "Light truck",
  car: "Car",
  motorcycle: "Motorcycle",
  bicycle: "Bicycle",
};

export const FUEL_TYPE_LABEL: Record<VehicleFuelType, string> = {
  petrol: "Petrol",
  diesel: "Diesel",
  hybrid: "Hybrid",
  electric: "Electric",
  none: "None",
};

/** ⚠ Who owns it, said plainly. Both are ordinary — a driver-owned vehicle is managed identically. */
export const OWNERSHIP_LABEL: Record<VehicleOwnership, string> = {
  effy_owned: "Effy owned",
  driver_owned: "Driver owned",
};

export const STATUS_LABEL: Record<VehicleStatus, string> = {
  active: "Active",
  off_road: "Off the road",
  retired: "Retired",
};

/** ⚠ `off_road` is NOT `retired`, and the words say so. Off the road is temporary and the vehicle
 *  comes back; retired is terminal and the record is kept for history. */
export const STATUS_MEANING: Record<VehicleStatus, string> = {
  active: "In service and able to be issued to a driver.",
  off_road: "Temporarily unavailable — in the workshop, or awaiting repair. Comes back.",
  retired: "No longer in the fleet. Its record and history are kept; it can never be issued again.",
};

/**
 * ⚠ AN ENUMERATED CAUSE, NOT A BOOLEAN, and the wording names what to renew.
 *
 * "Not compliant" tells an operator nothing about what to do. The remedy differs per item: renew a
 * registration, renew a policy, book an inspection.
 */
export const COMPLIANCE_LABEL: Record<VehicleComplianceIssue, string> = {
  registration_expired: "Registration expired",
  insurance_expired: "Insurance expired",
  roadworthy_expired: "Roadworthy inspection overdue",
};

/** "Chilled · Frozen", or an em dash. Refrigeration is a capability the fleet is selected on. */
export function refrigerationLabel(chilled: boolean, frozen: boolean): string {
  const parts = [chilled ? "Chilled" : null, frozen ? "Frozen" : null].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : "—";
}

export function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Australia/Melbourne",
  });
}

export function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-AU", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Australia/Melbourne",
  });
}

/** "48,120 km", or an em dash. A reading a human typed, not telemetry. */
export function formatOdometer(km: number | null): string {
  return km == null ? "—" : `${km.toLocaleString("en-AU")} km`;
}
