import type { GoLiveReadiness, GoLiveReadinessItem } from "@effy/shared-types";

import type { Queryable } from "../lib/db";
import { effyFee, UnpricedDistanceError, UnpricedWeightError } from "./engine";
import { effyValues, loadActivePlan, NoActivePlanError, type Plan } from "./plan";

/**
 * Can the new delivery model sell an order and deliver it? (083)
 *
 * ⚠ ONE DEFINITION, THREE CALLERS: the go-live page (which shows it), the switch's setter (which
 * refuses on it) and the sweep (which stops a scheduled switch when it stops being true). A page
 * that said "ready" while the setter refused — or a setter that allowed what the sweep then blocked —
 * would be three ideas of one fact.
 *
 * ⚠ REQUIRED vs ADVISORY. A required item is something without which a customer could be sold a
 * delivery the platform cannot price, cannot give a time to, or cannot collect. An advisory item is
 * a staffing or product choice the business may make on purpose (nobody cleared to deliver yet;
 * courier off, so addresses outside Effy's area are refused).
 *
 * ⚠ THE FEE PLAN IS ASKED TO PRICE, NOT JUST TO EXIST. An active plan whose distance or weight bands
 * stop short of what Effy's list needs prices nothing for those addresses — the checkout would
 * refuse them with no error anyone sees. The nearest and farthest listed postcode are priced through
 * the SAME function the checkout uses.
 *
 * Every `detail` is one plain line for staff; every `fixAt` is where in back-office it is put right.
 */
export async function goLiveReadiness(q: Queryable): Promise<GoLiveReadiness> {
  const items: GoLiveReadinessItem[] = [];
  const item = (key: GoLiveReadinessItem["key"], required: boolean, ready: boolean, detail: string, fixAt: string) =>
    items.push({ key, required, ready, detail, fixAt });

  // ── Where Effy delivers ──────────────────────────────────────────────────────────────────────
  // coverage-read: counts and the distance range of Effy's list — never a coverage decision.
  const list = (
    await q.query<{ n: string; nearest: string | null; farthest: string | null }>(
      `SELECT count(*) AS n, min(distance_km)::text AS nearest, max(distance_km)::text AS farthest FROM public.delivery_zone_postcode`,
    )
  ).rows[0];
  const postcodes = Number(list?.n ?? 0);
  item("coverage", true, postcodes > 0,
    postcodes > 0 ? `${postcodes} postcode${postcodes === 1 ? "" : "s"} on Effy's delivery list` : "No postcode is on Effy's delivery list",
    "/delivery?tab=coverage");

  const settings = (
    await q.query<{ hub: boolean; courier_offered: boolean | null }>(
      `SELECT (hub_latitude IS NOT NULL AND hub_longitude IS NOT NULL) AS hub, courier_offered FROM public.delivery_settings WHERE id = 1`,
    )
  ).rows[0];
  item("hub", true, settings?.hub === true,
    settings?.hub ? "The hub's location is set" : "The hub's location is not set — distances cannot be worked out",
    "/delivery?tab=settings");

  // ── What it costs ────────────────────────────────────────────────────────────────────────────
  let plan: Plan | null = null;
  try {
    plan = await loadActivePlan(q, "effy");
  } catch (err) {
    if (!(err instanceof NoActivePlanError)) throw err;
  }
  const priced = plan === null ? "No Effy fee plan is active" : unpricedReason(plan, list?.nearest ?? null, list?.farthest ?? null);
  item("effy_plan", true, plan !== null && priced === null,
    plan === null ? "No Effy fee plan is active" : priced ?? `The fee plan "${plan.name}" is active and prices every listed postcode`,
    "/delivery?tab=pricing");

  // ── When ─────────────────────────────────────────────────────────────────────────────────────
  // availability-exempt: public.delivery_slot / delivery_collection_run — a schedule's lifecycle.
  const counts = (
    await q.query<{ windows: string; runs: string }>(
      `SELECT (SELECT count(*) FROM public.delivery_slot WHERE status = 'active') AS windows,
              (SELECT count(*) FROM public.delivery_collection_run WHERE status = 'active') AS runs`,
    )
  ).rows[0];
  const windows = Number(counts?.windows ?? 0);
  const runs = Number(counts?.runs ?? 0);
  item("windows", true, windows > 0,
    windows > 0 ? `${windows} delivery window${windows === 1 ? "" : "s"} defined` : "No delivery window is defined — nothing could be offered",
    "/delivery?tab=slots");
  item("collection_runs", true, runs > 0,
    runs > 0 ? `${runs} collection run${runs === 1 ? "" : "s"} a day` : "No collection run is scheduled — parcels would never reach the hub",
    "/delivery?tab=schedule");

  // ── Courier: off, or complete ────────────────────────────────────────────────────────────────
  const courierOn = settings?.courier_offered === true;
  // availability-exempt: public.courier_service / delivery_fee_plan — their own lifecycles.
  const courier = (
    await q.query<{ plan: boolean; service: boolean }>(
      `SELECT EXISTS (SELECT 1 FROM public.delivery_fee_plan p WHERE p.kind = 'courier' AND p.is_active) AS plan,
              EXISTS (SELECT 1 FROM public.courier_service s WHERE s.is_default AND s.status = 'active') AS service`,
    )
  ).rows[0];
  const courierMissing = [courier?.plan ? null : "an active courier fee table", courier?.service ? null : "a default courier service"].filter(Boolean);
  item("courier", true, !courierOn || courierMissing.length === 0,
    !courierOn ? "Courier delivery is switched off"
      : courierMissing.length === 0 ? "Courier delivery is switched on and set up"
      : `Courier delivery is switched on but needs ${courierMissing.join(" and ")}`,
    "/delivery?tab=coverage");

  // ── Advisory ─────────────────────────────────────────────────────────────────────────────────
  const drivers = (
    await q.query<{ deliver: string; collect: string }>(
      `SELECT count(DISTINCT d.id) FILTER (WHERE c.function = 'delivery')   AS deliver,
              count(DISTINCT d.id) FILTER (WHERE c.function = 'collection') AS collect
         FROM public.driver d JOIN public.driver_zone_capability c ON c.driver_id = d.id
        WHERE d.status = 'active'`,
    )
  ).rows[0];
  const deliver = Number(drivers?.deliver ?? 0);
  const collect = Number(drivers?.collect ?? 0);
  item("drivers", false, deliver > 0 && collect > 0,
    deliver > 0 && collect > 0 ? `${deliver} driver${deliver === 1 ? "" : "s"} may deliver and ${collect} may collect`
      : deliver === 0 && collect === 0 ? "No driver may deliver or collect yet"
      : deliver === 0 ? "No driver may deliver yet" : "No driver may collect yet",
    "/drivers");
  item("out_of_area", false, courierOn,
    courierOn ? "Addresses outside Effy's area are offered courier delivery"
      : "Addresses outside Effy's area will be refused at checkout (courier delivery is off)",
    "/delivery?tab=coverage");

  return { ready: items.every((i) => !i.required || i.ready), items };
}

/**
 * Why the plan cannot price Effy's list, in one line — or null when it can.
 *
 * Distance is what can fall off the end: a plan with no open-ended "and beyond" band prices nothing
 * past its last one. Weight cannot — the heaviest band is the open top — unless the plan has no weight
 * band at all.
 */
function unpricedReason(plan: Plan, nearest: string | null, farthest: string | null): string | null {
  if (nearest === null || farthest === null) return null; // an empty list is the coverage item's failure
  const values = effyValues(plan);
  for (const km of new Set([Number(nearest), Number(farthest)])) {
    try {
      effyFee({ km, grams: 1, basketCents: 0, premiumCents: 0, plan: values });
    } catch (err) {
      if (err instanceof UnpricedDistanceError) return `The fee plan "${plan.name}" has no distance band for a postcode ${km} km from the hub`;
      if (err instanceof UnpricedWeightError) return `The fee plan "${plan.name}" has no weight band`;
      throw err;
    }
  }
  return null;
}
