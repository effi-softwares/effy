import type {
  VehicleBodyType,
  VehicleComplianceIssue,
  VehicleFuelType,
  VehicleOwnership,
  VehicleStatus,
} from "@effy/shared-types"

export interface VehicleListParams {
  status?: VehicleStatus | ""
  refrigeration?: "chilled" | "frozen" | ""
  nonCompliantOnly?: boolean
  cursor?: string
}

export const BODY_TYPE_LABEL: Record<VehicleBodyType, string> = {
  van: "Van",
  ute: "Ute",
  truck_light: "Light truck",
  car: "Car",
  motorcycle: "Motorcycle",
  bicycle: "Bicycle",
}

export const FUEL_TYPE_LABEL: Record<VehicleFuelType, string> = {
  petrol: "Petrol",
  diesel: "Diesel",
  hybrid: "Hybrid",
  electric: "Electric",
  none: "None",
}

export const OWNERSHIP_LABEL: Record<VehicleOwnership, string> = {
  effy_owned: "Effy owned",
  driver_owned: "Driver owned",
}

export const STATUS_LABEL: Record<VehicleStatus, string> = {
  active: "Active",
  off_road: "Off the road",
  retired: "Retired",
}

export const STATUS_MEANING: Record<VehicleStatus, string> = {
  active: "In service and able to be issued to a driver.",
  off_road: "Temporarily unavailable — in the workshop, or awaiting repair. Comes back.",
  retired: "No longer in the fleet. Its record and history are kept; it can never be issued again.",
}

export const COMPLIANCE_LABEL: Record<VehicleComplianceIssue, string> = {
  registration_expired: "Registration expired",
  insurance_expired: "Insurance expired",
  roadworthy_expired: "Roadworthy inspection overdue",
}

export function refrigerationLabel(chilled: boolean, frozen: boolean): string {
  const parts = [chilled ? "Chilled" : null, frozen ? "Frozen" : null].filter(Boolean)
  return parts.length > 0 ? parts.join(" · ") : "—"
}

export function formatDate(iso: string | null): string {
  if (!iso) return "—"
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return "—"
  return d.toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Australia/Melbourne",
  })
}

export function formatDateTime(iso: string | null): string {
  if (!iso) return "—"
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return "—"
  return d.toLocaleString("en-AU", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Australia/Melbourne",
  })
}

export function formatOdometer(km: number | null): string {
  return km == null ? "—" : `${km.toLocaleString("en-AU")} km`
}
