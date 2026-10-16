// How each package was handed over at each step (090) — the record dispatch will read to see which
// labels fail and which hand-overs skip scanning (backlog H12).
//
// ⚠ ONE WRITER, CALLED INSIDE EACH HAND-OVER'S OWN TRANSACTION, so the record and the hand-over commit
// together. Optional by design: an app that sends no methods (every build before scanning) records
// nothing and the hand-over behaves exactly as before.

import type { HandoverMethod, PackageHandover } from "@effy/shared-types";

export type HandoverStep = "collect" | "checkin" | "load" | "deliver" | "return";

const METHODS: ReadonlySet<string> = new Set<HandoverMethod>(["scan", "typed", "manual"]);

export interface RecordHandoversInput {
  step: HandoverStep;
  roundId: string;
  driverId: string;
  changeId: string;
  /** What the app said; anything malformed is skipped, never an error. */
  packages: ReadonlyArray<Partial<PackageHandover>> | undefined;
  /**
   * The packages this hand-over actually covers. A package id outside it is ignored: the record says
   * what happened at THIS hand-over, and a stray id must not invent one.
   */
  allowed: ReadonlySet<string>;
}

/** Record one row per package; a retried hand-over (same changeId) records nothing new. */
export async function recordHandovers(tx: any, input: RecordHandoversInput): Promise<number> {
  const rows = (input.packages ?? []).filter(
    (p): p is PackageHandover =>
      typeof p?.packageId === "string" && input.allowed.has(p.packageId) && typeof p.method === "string" && METHODS.has(p.method),
  );
  // One method per package per hand-over: a package listed twice keeps its first.
  const byPackage = new Map<string, HandoverMethod>();
  for (const r of rows) if (!byPackage.has(r.packageId)) byPackage.set(r.packageId, r.method);
  if (byPackage.size === 0) return 0;
  const res = await tx.query(
    `INSERT INTO public.package_handover (shop_fulfillment_id, round_id, driver_id, step, handover_method, change_id)
     SELECT p.package_id, $1, $2, $3, p.method, $4
       FROM unnest($5::uuid[], $6::text[]) AS p(package_id, method)
     ON CONFLICT (change_id, shop_fulfillment_id) DO NOTHING`,
    [input.roundId, input.driverId, input.step, input.changeId, [...byPackage.keys()], [...byPackage.values()]],
  );
  return res.rowCount ?? 0;
}
