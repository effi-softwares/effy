// Operational thresholds: environment configuration with declared defaults, never literals. Every key
// must be declared in serverless.yml (`config.contract.test.ts` checks).

export const FLEET_ENV_KEYS = ["FLEET_DUTY_OVERDUE_HOURS", "FLEET_EXPIRY_WARNING_DAYS"] as const;

function positiveInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const n = Number(raw);
  // A malformed value falls back rather than putting NaN into a SQL interval.
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.floor(n);
}

/** A duty session open longer than this is overdue. */
export function dutyOverdueHours(): number {
  return positiveInt("FLEET_DUTY_OVERDUE_HOURS", 14);
}

/** A licence or registration expiring within this many days is flagged. */
export function expiryWarningDays(): number {
  return positiveInt("FLEET_EXPIRY_WARNING_DAYS", 30);
}
