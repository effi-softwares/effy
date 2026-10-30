import type { DriverBlockedReason, DriverEmploymentStatus } from "@effy/shared-types"
import { defineListSearch, searchFilter } from "@effy/web-kit/data-table"

/** A quick read of the register outside its screen (a picker of active drivers). */
export interface DriverListParams {
  q?: string
  status?: DriverEmploymentStatus | ""
}

export const DRIVER_LIST_VIEWS = ["employed", "active", "suspended", "offboarded", "everyone"] as const
export type DriverListView = (typeof DRIVER_LIST_VIEWS)[number]

/** The register's view in the address (103), mirroring the fleet service's `DRIVER_LIST_SPEC`. */
export const driversList = defineListSearch({
  id: "drivers",
  mode: "offset",
  sorts: ["name"] as const,
  defaultSort: "name",
  sortDir: { name: "asc" },
  filters: { view: searchFilter.oneOf(DRIVER_LIST_VIEWS), zoneId: searchFilter.uuid },
})

export const STATUS_LABEL: Record<DriverEmploymentStatus, string> = {
  active: "Active",
  suspended: "Suspended",
  offboarded: "Offboarded",
}

export const STATUS_MEANING: Record<DriverEmploymentStatus, string> = {
  active: "Employed and eligible for work.",
  suspended: "Temporarily stood down. No sign-in, no new work. Can be restored.",
  offboarded: "No longer employed. Record and history kept; sign-in ends permanently.",
}

export const BLOCKED_LABEL: Record<DriverBlockedReason, string> = {
  no_capabilities: "Not cleared for any work - cannot be given work",
  suspended: "Suspended - cannot be given work",
  offboarded: "Offboarded - cannot be given work",
  licence_expired: "Licence expired - cannot be given work",
  no_vehicle: "No vehicle assigned - cannot be given work",
  vehicle_non_compliant: "Assigned vehicle is not roadworthy - cannot be given work",
}

export function formatTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return "-"
  return d.toLocaleTimeString("en-AU", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Australia/Melbourne",
  })
}

export function durationSince(iso: string, now = Date.now()): string {
  const ms = Math.max(0, now - Date.parse(iso))
  const mins = Math.floor(ms / 60000)
  const h = Math.floor(mins / 60)
  const m = mins % 60
  if (h === 0) return `${m} min`
  return `${h} h ${m} min`
}

export function formatDate(iso: string | null): string {
  if (!iso) return "-"
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return "-"
  return d.toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Australia/Melbourne",
  })
}

export function formatDateTime(iso: string | null): string {
  if (!iso) return "-"
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return "-"
  return d.toLocaleString("en-AU", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Australia/Melbourne",
  })
}
