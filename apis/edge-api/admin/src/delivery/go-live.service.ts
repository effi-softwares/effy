// Going live with the new delivery model (083): the checklist, the switch, and the old orders still open.
//
// ⚠ THE SWITCH IS REFUSED WHILE THE PLATFORM IS NOT READY — by the SAME function the page shows
// (`goLiveReadiness`) and the sweep re-checks until the moment arrives. Nothing here decides whether an
// order is sold the new way: `public.delivery_model_v2_at` still answers that, from the one column
// this service writes.
import { emitMetric, query, type Queryable } from "@effy/edge-shared";
import { goLiveReadiness, legacyOpenOrders } from "@effy/edge-shared/delivery";
import { announce } from "@effy/edge-shared/live";
import type { GoLiveDTO, GoLiveReadinessItem, GoLiveRefusal, GoLiveSwitch, GoLiveSwitchRequest } from "@effy/shared-types";

import { isAdmin, readSwitch, SWEEP_ACTOR, switchHistory, writeSwitch, type SwitchRow } from "./go-live.repository";

const pooled: Queryable = { query: (text, values) => query(text, values) };
const MAX_REASON = 500;
/** A scheduled switch this close to its moment is stopped if the platform is not ready (research R4). */
export const BLOCK_WITHIN_MS = 10 * 60_000;
const NAMESPACE = "Effy/Platform";

/** A refusal a person can act on; `code` is the API's problem code. */
export class GoLiveError extends Error {
  constructor(readonly status: 400 | 403 | 409, readonly code: GoLiveRefusal | "validation_failed" | "forbidden", message: string, readonly extra: Record<string, unknown> = {}) {
    super(message);
    this.name = "GoLiveError";
  }
}

// The coverage answer changes with the switch (a courier postcode becomes offerable), and so does this page.
const changed = (): Promise<void> => announce([{ scope: "ops", kind: "coverage" }]);

function switchState(row: SwitchRow, now: Date, setBy: string | null, setAt: Date | null): GoLiveSwitch {
  const state = row.removedAt !== null ? "on" : row.at === null ? "off" : row.at.getTime() > now.getTime() ? "scheduled" : "on";
  return {
    state,
    at: row.at?.toISOString() ?? null,
    setBy, setAt: setAt?.toISOString() ?? null,
    canTurnBack: state === "on" && row.removedAt === null,
    removedAt: row.removedAt?.toISOString() ?? null,
  };
}

/** `GET /admin/v1/delivery/go-live` */
export async function readGoLive(now = new Date()): Promise<GoLiveDTO> {
  const [readiness, row, history] = [await goLiveReadiness(pooled), await readSwitch(), await switchHistory()];
  // Who set the moment that stands: the latest entry that set or changed it.
  const setter = row.at === null ? undefined : history.find((h) => h.action === "set" || h.action === "changed");
  const sw = switchState(row, now, setter?.by ?? null, setter?.at ?? null);
  const legacy = sw.state === "on" ? await legacyOpenOrders(pooled) : null;
  return {
    readiness,
    switch: sw,
    legacy: legacy ? { open: legacy.open, lastClosedAt: legacy.lastClosedAt?.toISOString() ?? null, alertAfterDays: row.alertAfterDays } : null,
    history: history.map((h) => ({ at: h.at.toISOString(), action: h.action, value: h.value, by: h.by, reason: h.reason })),
  };
}

const failing = (items: readonly GoLiveReadinessItem[]) => items.filter((i) => i.required && !i.ready);

/**
 * `PUT /admin/v1/delivery/go-live/switch` — set, change, cancel, or turn back off.
 *
 *   at = an instant or "now"   set (or change) the moment — refused unless every required item is ready
 *   at = null, moment ahead    cancel the scheduled switch
 *   at = null, moment passed   turn the new model back OFF — needs a reason; refused once the old
 *                              arrangement has been removed (there is nothing to go back to)
 *
 * ⚠ Orders placed while the model was on keep what they were sold either way: they carry their own
 * delivery type and nothing here touches an order.
 */
export async function setSwitch(body: GoLiveSwitchRequest, actorSub: string, now = new Date()): Promise<GoLiveSwitch> {
  if (!(await isAdmin(actorSub))) throw new GoLiveError(403, "forbidden", "only an administrator can switch the delivery model");

  const parse = (v: unknown, field: string): Date | null => {
    if (v === null || v === undefined) return null;
    const d = typeof v === "string" ? new Date(v) : new Date(Number.NaN);
    if (Number.isNaN(d.getTime())) throw new GoLiveError(400, "validation_failed", `${field} must be a date and time`, { fields: [{ field, message: "a date and time" }] });
    return d;
  };
  const expected = parse(body?.expected, "expected");
  const reason = typeof body?.reason === "string" ? body.reason.trim().slice(0, MAX_REASON) : "";
  const current = await readSwitch();
  if (current.removedAt !== null) throw new GoLiveError(409, "removed", "the old arrangement has been removed; the new delivery model is on for good");

  let to: Date | null;
  let action: "set" | "changed" | "cancelled" | "turned_off";
  if (body?.at === null || body?.at === undefined) {
    to = null;
    if (current.at !== null && current.at.getTime() <= now.getTime()) {
      if (reason === "") throw new GoLiveError(400, "validation_failed", "say why the new delivery model is being turned back off", { fields: [{ field: "reason", message: "required to turn the model back off" }] });
      action = "turned_off";
    } else {
      action = "cancelled";
    }
  } else {
    const asked = body.at === "now" ? now : parse(body.at, "at")!;
    // A moment already past means now: the record should say when it really began.
    to = asked.getTime() < now.getTime() ? now : asked;
    const readiness = await goLiveReadiness(pooled);
    if (!readiness.ready) {
      throw new GoLiveError(409, "not_ready", "the platform is not ready for the new delivery model", { items: failing(readiness.items) });
    }
    action = current.at === null ? "set" : "changed";
  }

  const written = await writeSwitch({ to, expected, action, actorSub, reason: reason || null });
  if (!written) throw new GoLiveError(409, "changed", "the switch changed a moment ago; check it and try again");
  emitMetric(NAMESPACE, "DeliveryModelSwitchChanges", 1, { action });
  await changed();
  return (await readGoLive(now)).switch;
}

export interface SweepOutcome {
  state: "off" | "scheduled" | "on";
  ready: boolean | null;
  blocked: boolean;
  legacyOpen: number | null;
  legacyPastDue: number | null;
}

/**
 * Every five minutes (research R4, R5).
 *
 * WHILE A SWITCH IS SCHEDULED: is the platform still ready? If not, and the moment is near, the
 * scheduled switch is CLEARED — a plan deactivated the night before must not switch on a checkout that
 * cannot price — and the operator is alerted. ⚠ A moment that has PASSED is never undone here:
 * customers are already being sold the new way, and reverting that is a person's decision.
 *
 * WHILE THE SWITCH IS ON: how many old-kind orders are still open, and — past the alert age — how many
 * are overdue to close.
 */
export async function sweep(now = new Date()): Promise<SweepOutcome> {
  const row = await readSwitch();
  if (row.at === null && row.removedAt === null) return { state: "off", ready: null, blocked: false, legacyOpen: null, legacyPastDue: null };

  if (row.removedAt === null && row.at !== null && row.at.getTime() > now.getTime()) {
    const readiness = await goLiveReadiness(pooled);
    emitMetric(NAMESPACE, "DeliveryModelSwitchReady", readiness.ready ? 1 : 0);
    let blocked = false;
    if (!readiness.ready && row.at.getTime() - now.getTime() <= BLOCK_WITHIN_MS) {
      const written = await writeSwitch({
        to: null, expected: row.at, action: "blocked", actorSub: SWEEP_ACTOR,
        reason: "the platform was not ready when the moment came",
        detail: { items: failing(readiness.items).map((i) => i.key) },
      });
      blocked = written !== null;
      if (blocked) await changed();
    }
    emitMetric(NAMESPACE, "DeliveryModelSwitchBlocked", blocked ? 1 : 0);
    return { state: "scheduled", ready: readiness.ready, blocked, legacyOpen: null, legacyPastDue: null };
  }

  // On. (After the removal there can be no open old order — the migration refused otherwise — and the count says 0.)
  const legacy = await legacyOpenOrders(pooled);
  const since = row.at ?? row.removedAt!;
  const pastDue = now.getTime() - since.getTime() > row.alertAfterDays * 86_400_000 ? legacy.open : 0;
  emitMetric(NAMESPACE, "LegacyOrdersOpen", legacy.open);
  emitMetric(NAMESPACE, "LegacyOrdersOpenPastDue", pastDue);
  return { state: "on", ready: null, blocked: false, legacyOpen: legacy.open, legacyPastDue: pastDue };
}
