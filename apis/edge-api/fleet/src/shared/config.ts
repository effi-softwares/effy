// Operational thresholds for the fleet service (056). Research R11: these are OPERATIONAL FACTS
// (how long a shift runs, how much notice a licence expiry needs), not constants — so they are
// environment configuration with declared defaults, never literals buried in a query.
//
// ⚠ Every key here MUST also be declared in serverless.yml. `config.contract.test.ts` reads the REAL
// serverless.yml and fails if one is missing. That guard exists because 035 read four env vars its
// serverless.yml never declared: every pool resolved "unknown", no email was ever sent, and 100
// passing tests missed it BECAUSE THE TESTS SET THOSE VARS THEMSELVES.

/** Env var names this module reads. The contract test asserts serverless.yml declares each one. */
export const FLEET_ENV_KEYS = ["FLEET_DUTY_OVERDUE_HOURS", "FLEET_EXPIRY_WARNING_DAYS"] as const;

function positiveInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const n = Number(raw);
  // A malformed value falls back rather than propagating NaN into a SQL interval, which would
  // silently match nothing — a threshold that quietly stops flagging is worse than a wrong one.
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.floor(n);
}

/** FR-037 — a duty session open longer than this is flagged as overdue. */
export function dutyOverdueHours(): number {
  return positiveInt("FLEET_DUTY_OVERDUE_HOURS", 14);
}

/** FR-046 — a licence or registration expiring within this many days is flagged. */
export function expiryWarningDays(): number {
  return positiveInt("FLEET_EXPIRY_WARNING_DAYS", 30);
}
