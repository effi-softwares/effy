/**
 * The points rules (074) — one row, changed only by a back-office admin, every change audited (FR-025).
 *
 * ⚠ A CHANGE APPLIES FROM THAT MOMENT ONLY (FR-026). Nothing here rewrites a lot's expires_at or an
 * order's cents_per_point: those were snapshotted when they were made.
 */
import type { Queryable } from "../lib/db";
import { PointsSettingInvalidError } from "./errors";

export interface PointsSettings {
  centsPerPoint: number;
  expiryMonths: number;
  csaCreditLimitPoints: number;
  warningDays: number;
  holdMinutes: number;
  updatedBy: string;
  updatedAt: Date;
}

export type PointsSettingsPatch = Partial<Pick<PointsSettings, "centsPerPoint" | "expiryMonths" | "csaCreditLimitPoints" | "warningDays" | "holdMinutes">>;

interface Row {
  cents_per_point: number;
  expiry_months: number;
  csa_credit_limit_points: number;
  warning_days: number;
  hold_minutes: number;
  updated_by: string;
  updated_at: Date;
}

/** field → [column, min, max]. The same ranges as the table's CHECKs, so a refusal names the field. */
const FIELDS: Readonly<Record<keyof PointsSettingsPatch, readonly [string, number, number]>> = {
  centsPerPoint: ["cents_per_point", 1, 10_000],
  expiryMonths: ["expiry_months", 1, 120],
  csaCreditLimitPoints: ["csa_credit_limit_points", 0, 1_000_000],
  warningDays: ["warning_days", 1, 365],
  holdMinutes: ["hold_minutes", 5, 240],
};

const map = (r: Row): PointsSettings => ({
  centsPerPoint: r.cents_per_point,
  expiryMonths: r.expiry_months,
  csaCreditLimitPoints: r.csa_credit_limit_points,
  warningDays: r.warning_days,
  holdMinutes: r.hold_minutes,
  updatedBy: r.updated_by,
  updatedAt: r.updated_at,
});

const SELECT = `SELECT cents_per_point, expiry_months, csa_credit_limit_points, warning_days, hold_minutes, updated_by, updated_at
                  FROM public.points_settings WHERE id = 1`;

export async function loadSettings(q: Queryable): Promise<PointsSettings> {
  const row = (await q.query<Row>(SELECT)).rows[0];
  // The migration seeds the row; its absence is a broken database, not a default to invent.
  if (!row) throw new Error("points: settings row missing");
  return map(row);
}

/**
 * Apply a patch inside the caller's transaction. Only fields whose value actually changes are written,
 * and each writes one audit row. Returns the settings as they now are.
 */
export async function updateSettings(tx: Queryable, patch: PointsSettingsPatch, actorSub: string): Promise<PointsSettings> {
  const current = (await tx.query<Row>(`${SELECT} FOR UPDATE`)).rows[0];
  if (!current) throw new Error("points: settings row missing");
  const before = map(current);

  for (const [field, value] of Object.entries(patch) as [keyof PointsSettingsPatch, number | undefined][]) {
    if (value === undefined) continue;
    const spec = FIELDS[field];
    if (!spec) throw new PointsSettingInvalidError(field);
    const [column, min, max] = spec;
    if (!Number.isInteger(value) || value < min || value > max) throw new PointsSettingInvalidError(field);
    if (value === before[field]) continue;

    // `column` comes from the fixed FIELDS map above, never from the request.
    await tx.query(`UPDATE public.points_settings SET ${column} = $1, updated_by = $2, updated_at = now() WHERE id = 1`, [value, actorSub]);
    await tx.query(
      `INSERT INTO public.points_settings_change (field, old_value, new_value, changed_by) VALUES ($1, $2, $3, $4)`,
      [field, String(before[field]), String(value), actorSub],
    );
  }
  return loadSettings(tx);
}

/** The recorded changes, newest first. */
export async function settingsHistory(q: Queryable, limit = 50) {
  return (
    await q.query<{ field: string; old_value: string; new_value: string; changed_by: string; changed_at: Date }>(
      `SELECT field, old_value, new_value, changed_by, changed_at FROM public.points_settings_change ORDER BY changed_at DESC, id DESC LIMIT $1`,
      [limit],
    )
  ).rows.map((r) => ({ field: r.field, oldValue: r.old_value, newValue: r.new_value, changedBy: r.changed_by, changedAt: r.changed_at }));
}
