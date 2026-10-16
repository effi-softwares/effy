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

/**
 * Record one row per package; a retried hand-over (same changeId) records nothing new.
 *
 * ⚠ 092 — A PACKAGE MAY BE NAMED BY ITS LABEL CODE instead of its id (the delivery steps hold only
 * codes). Codes are resolved to ids here, against [allowed] — a code for a package outside this
 * hand-over names nothing, exactly as a stray id does.
 */
export async function recordHandovers(tx: any, input: RecordHandoversInput): Promise<number> {
  const wellFormed = (input.packages ?? []).filter(
    (p): p is Partial<PackageHandover> & { method: HandoverMethod } => typeof p?.method === "string" && METHODS.has(p.method),
  );
  const codes = [...new Set(wellFormed.filter((p) => typeof p.packageCode === "string" && !p.packageId).map((p) => p.packageCode as string))];
  const idOfCode = new Map<string, string>();
  if (codes.length > 0 && input.allowed.size > 0) {
    const res = await tx.query(
      `SELECT id, package_code FROM public.shop_fulfillment WHERE package_code = ANY($1::text[]) AND id = ANY($2::uuid[])`,
      [codes, [...input.allowed]],
    );
    for (const r of res.rows as Array<{ id: string; package_code: string }>) idOfCode.set(r.package_code, r.id);
  }
  // One method per package per hand-over: a package listed twice keeps its first.
  const byPackage = new Map<string, HandoverMethod>();
  for (const p of wellFormed) {
    const id = typeof p.packageId === "string" ? p.packageId : p.packageCode ? idOfCode.get(p.packageCode) : undefined;
    if (id && input.allowed.has(id) && !byPackage.has(id)) byPackage.set(id, p.method);
  }
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
