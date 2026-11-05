// The back-office Overview's fleet facts (2026-11-05): today's collection runs and the shops still
// preparing for the next one. Every judgement is someone else's: the run times are the planner's
// schedule, the run each package travels on is `everyShopPackageRuns` (the one rule shops are told, 099).

import { instantAtLocalTime, localDateParts, query, type Queryable } from "@effy/edge-shared";
import { everyShopPackageRuns } from "@effy/edge-shared/delivery";
import type { FleetOverviewDTO, OverviewRunDTO } from "@effy/shared-types";

const pooled: Queryable = { query: (text, values) => query(text, values) };

/** Today's collection rounds, by the run they serve (a collection round's deadline IS its run). */
const RUN_ROUNDS = `
  SELECT dr.deadline_at, dr.status
    FROM public.driver_round dr
   WHERE dr.kind = 'collection'
     AND dr.status <> 'cancelled'
     AND dr.deadline_at >= $1 AND dr.deadline_at < $2
`;

const SHOP_NAMES = `SELECT id::text AS id, name FROM public.shop WHERE id = ANY($1::uuid[])`;

export async function readOverview(now = new Date(), db: Queryable = pooled): Promise<FleetOverviewDTO> {
  const { schedule, nextRun, packages } = await everyShopPackageRuns(now, db);
  const { year, month, day } = localDateParts(now);
  const from = instantAtLocalTime(year, month, day, 0, 0);
  const to = instantAtLocalTime(year, month, day + 1, 0, 0);
  const rounds = (await db.query<{ deadline_at: Date; status: string }>(RUN_ROUNDS, [from, to])).rows;

  const times = schedule.runs
    .map((r) => instantAtLocalTime(year, month, day, r.hour, r.minute))
    .sort((a, b) => a.getTime() - b.getTime());
  let nextSeen = false;
  const runs: OverviewRunDTO[] = times.map((at) => {
    const mine = rounds.filter((r) => r.deadline_at.getTime() === at.getTime());
    let state: OverviewRunDTO["state"];
    if (at.getTime() <= now.getTime()) state = mine.some((r) => r.status !== "completed") ? "late" : "done";
    else if (!nextSeen) {
      state = "next";
      nextSeen = true;
    } else state = "later";
    return { at: at.toISOString(), state, rounds: mine.length };
  });

  const due = nextRun === null ? [] : packages.filter((p) => p.runAt !== null && p.runAt.getTime() === nextRun.getTime());
  const byShop = new Map<string, { notReady: number; of: number }>();
  for (const p of due) {
    const s = byShop.get(p.shopId) ?? { notReady: 0, of: 0 };
    s.of += 1;
    if (p.status !== "ready_for_pickup") s.notReady += 1;
    byShop.set(p.shopId, s);
  }
  const behindIds = [...byShop].filter(([, s]) => s.notReady > 0).map(([id]) => id);
  const names = new Map(
    behindIds.length === 0
      ? []
      : (await db.query<{ id: string; name: string }>(SHOP_NAMES, [behindIds])).rows.map((r) => [r.id, r.name] as const),
  );
  const shopsBehind = behindIds
    .map((id) => ({ shopId: id, name: names.get(id) ?? "A shop", ...byShop.get(id)! }))
    .sort((a, b) => b.notReady - a.notReady || a.name.localeCompare(b.name));

  return {
    runs,
    nextRunAt: nextRun ? nextRun.toISOString() : null,
    shopsBehind,
    nextRun: { shops: byShop.size, packages: due.length },
  };
}
