import type {
  DriverBlockedReason,
  DriverEmploymentStatus,
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

// ⚠ The exception and run-type vocabularies stood here — "Delivery failed" / "Nobody home" /
// "Collection round" and the rest. They named states in the 049 work model, dropped whole by
// db/migrations/20260920101500_remove_driver_work_model.sql, and are removed rather than kept as
// labels with nothing to label.

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
