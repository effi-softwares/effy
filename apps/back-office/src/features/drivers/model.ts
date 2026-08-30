import type {
  DriverBlockedReason,
  DriverEmploymentStatus,
  DriverExceptionKind,
} from "@effy/shared-types";

// Screen-facing vocabulary for the driver console (056). The wire shapes come from
// @effy/shared-types; this file holds the console's own copy and query shapes.

export interface DriverListParams {
  q?: string;
  status?: DriverEmploymentStatus | "";
  zoneId?: string;
  includeOffboarded?: boolean;
  cursor?: string;
}

export interface ExceptionListParams {
  kind?: DriverExceptionKind | "";
  resolved?: "false" | "true" | "all";
  driverId?: string;
  cursor?: string;
}

/** Employment status as a person reads it, with the consequence spelled out. */
export const STATUS_LABEL: Record<DriverEmploymentStatus, string> = {
  active: "Active",
  suspended: "Suspended",
  offboarded: "Offboarded",
};

export const STATUS_MEANING: Record<DriverEmploymentStatus, string> = {
  active: "Employed and eligible for work.",
  suspended: "Temporarily stood down. No sign-in, no new work. Can be restored.",
  offboarded: "No longer employed. Record and history kept; sign-in ends permanently.",
};

/**
 * ⚠ Why a driver cannot be given work, in words an operator can act on.
 *
 * FR-044 says the reason must be STATED, not implied by a flag. Each of these has a different
 * remedy, and "cannot receive work" on its own tells nobody which one to apply.
 */
export const BLOCKED_LABEL: Record<DriverBlockedReason, string> = {
  no_zone: "No delivery zone — cannot be given work",
  suspended: "Suspended — cannot be given work",
  offboarded: "Offboarded — cannot be given work",
  licence_expired: "Licence expired — cannot be given work",
};

export const EXCEPTION_KIND_LABEL: Record<DriverExceptionKind, string> = {
  delivery_failure: "Delivery failed",
  collection_issue: "Collection problem",
};

/** Driver-reported reasons, as recorded by the driver app (049). */
export const EXCEPTION_REASON_LABEL: Record<string, string> = {
  nobody_home: "Nobody home",
  wrong_address: "Wrong address",
  customer_refused: "Customer refused",
  access_blocked: "Access blocked",
  other: "Other",
  missing: "Package missing at shop",
  short: "Short at shop",
};

export function exceptionReasonLabel(reason: string): string {
  return EXCEPTION_REASON_LABEL[reason] ?? reason;
}

/** Run types as a person reads them. */
export const RUN_TYPE_LABEL: Record<string, string> = {
  collection: "Collection round",
  same_day_delivery: "Same-day delivery round",
};

/** "3 h 20 m on duty" — a duration a person can scan, not a timestamp they have to subtract. */
export function durationSince(iso: string, now = Date.now()): string {
  const ms = Math.max(0, now - Date.parse(iso));
  const mins = Math.floor(ms / 60000);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m} min`;
  return `${h} h ${m} min`;
}

/** A date a person reads, in the platform's operating timezone. */
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
