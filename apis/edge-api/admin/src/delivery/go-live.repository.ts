// Going live with the new delivery model (083): SQL only.
//
// ⚠ THIS FILE IS THE ONE WRITER OF THE SWITCH — `delivery_settings.delivery_model_v2_from`. It has had
// one reader since 078 (`public.delivery_model_v2_at`); `windows.guard.test.ts` holds both. Every
// write is in the same transaction as its `admin.audit_log` row: who set, changed, cancelled or
// turned off the switch, and when, is read back from that trail and stored nowhere else.
import type pg from "pg";

import { query, withTransaction } from "@effy/edge-shared";

type Client = pg.PoolClient;

export type SwitchAction = "set" | "changed" | "cancelled" | "turned_off" | "blocked";
const ACTION_PREFIX = "delivery.model_switch_";
/** The audit actor for a block made by the sweep — nobody at Effy did it. */
export const SWEEP_ACTOR = "system:delivery-model-sweep";

export interface SwitchRow {
  /** The moment the new model applies from; null = off. */
  at: Date | null;
  /** When the old arrangement was removed (stage 2); null until then — and on a database that predates the column. */
  removedAt: Date | null;
  alertAfterDays: number;
}

/**
 * The switch as stored. ⚠ `legacy_model_removed_at` arrives with stage 2's migration; it is read
 * through `to_jsonb` so this works before and after it, without a query that fails on a missing column.
 */
const SWITCH_SQL = `
  SELECT s.delivery_model_v2_from AS at,
         (to_jsonb(s) ->> 'legacy_model_removed_at')::timestamptz AS removed_at,
         s.legacy_orders_alert_days AS alert_after_days
    FROM public.delivery_settings s WHERE s.id = 1`;

interface Raw { at: Date | null; removed_at: Date | null; alert_after_days: number }
const toSwitch = (r: Raw | undefined): SwitchRow => ({ at: r?.at ?? null, removedAt: r?.removed_at ?? null, alertAfterDays: r?.alert_after_days ?? 7 });

export async function readSwitch(): Promise<SwitchRow> {
  return toSwitch((await query<Raw>(SWITCH_SQL)).rows[0]);
}

export interface HistoryRow { at: Date; action: SwitchAction; value: string | null; by: string; reason: string | null }

/** The switch's trail, newest first. The actor is named from the staff record; the sweep is "The platform". */
export async function switchHistory(limit = 20): Promise<HistoryRow[]> {
  const res = await query<{ created_at: Date; action: string; detail: { to?: string | null; reason?: string | null }; name: string | null; actor_sub: string }>(
    `SELECT a.created_at, a.action, a.detail, COALESCE(NULLIF(btrim(st.name), ''), st.email) AS name, a.actor_sub
       FROM admin.audit_log a
       LEFT JOIN admin.staff st ON st.cognito_sub = a.actor_sub
      WHERE a.target_type = 'delivery_model'
      ORDER BY a.created_at DESC, a.id DESC
      LIMIT $1`,
    [limit],
  );
  return res.rows.map((r) => ({
    at: r.created_at,
    action: r.action.slice(ACTION_PREFIX.length) as SwitchAction,
    value: r.detail?.to ?? null,
    by: r.actor_sub === SWEEP_ACTOR ? "The platform" : r.name ?? "a staff member",
    reason: r.detail?.reason ?? null,
  }));
}

/**
 * Write the switch and its audit row together — under the settings row's lock, having checked it
 * still holds what the caller saw. Returns null when it does not (two admins at once): nothing is
 * written, and the caller says so.
 */
export async function writeSwitch(input: {
  to: Date | null;
  /** The value the caller acted on; `undefined` = do not check (the sweep re-reads under the lock itself). */
  expected: Date | null | undefined;
  action: SwitchAction;
  actorSub: string;
  reason: string | null;
  detail?: Record<string, unknown>;
}): Promise<SwitchRow | null> {
  return withTransaction(async (tx: Client) => {
    const cur = toSwitch((await tx.query<Raw>(`${SWITCH_SQL} FOR UPDATE OF s`)).rows[0]);
    if (input.expected !== undefined && (cur.at?.getTime() ?? null) !== (input.expected?.getTime() ?? null)) return null;
    await tx.query(`UPDATE public.delivery_settings SET delivery_model_v2_from = $1, updated_at = now() WHERE id = 1`, [input.to]);
    await tx.query(
      `INSERT INTO admin.audit_log (actor_sub, action, target_type, target_id, detail) VALUES ($1, $2, 'delivery_model', NULL, $3::jsonb)`,
      [input.actorSub, `${ACTION_PREFIX}${input.action}`, JSON.stringify({ from: cur.at?.toISOString() ?? null, to: input.to?.toISOString() ?? null, reason: input.reason, ...input.detail })],
    );
    return { ...cur, at: input.to };
  });
}

/** Admin — and only admin: the switch changes what every customer is sold. Decided from the staff record. */
export async function isAdmin(sub: string): Promise<boolean> {
  const res = await query<{ ok: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM admin.staff s JOIN admin.staff_role sr ON sr.staff_id = s.id
        WHERE s.cognito_sub = $1 AND s.status = 'active' AND sr.role_key = 'admin'
     ) AS ok`,
    [sub],
  );
  return res.rows[0]?.ok ?? false;
}
