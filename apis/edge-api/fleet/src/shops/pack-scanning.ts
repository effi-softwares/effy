// 096 US4 — "Require pack scanning" (FR-020): when on, a shop cannot mark a portion ready until every
// bag's label has been scanned as packed. It is dispatch's rule for a shop, so it lives in fleet (the
// staff gateway), not in the admin stack, which is at CloudFormation's resource limit (095).
//
// ⚠ The ONE writer of `shop.pack_scan_required`. The shop service only reads it, at the ready gate.
import { withTransaction } from "@effy/edge-shared";
import type pg from "pg";

import { recordAudit } from "../shared/audit";
import { notFound } from "../shared/errors";

export interface PackScanning {
  shopId: string;
  required: boolean;
}

async function write(tx: pg.PoolClient, shopId: string, required: boolean): Promise<{ changed: boolean } | null> {
  const res = await tx.query<{ before: boolean }>(
    `UPDATE public.shop s SET pack_scan_required = $2
       FROM (SELECT id, pack_scan_required AS before FROM public.shop WHERE id = $1 FOR UPDATE) old
      WHERE s.id = old.id
      RETURNING old.before`,
    [shopId, required],
  );
  if ((res.rowCount ?? 0) === 0) return null;
  return { changed: res.rows[0]!.before !== required };
}

/** Set the rule; a repeat of the same value changes nothing and writes no audit row. */
export async function setPackScanning(shopId: string, required: boolean, actorSub: string): Promise<PackScanning> {
  return withTransaction(async (tx) => {
    const out = await write(tx, shopId, required);
    if (!out) throw notFound("no such shop");
    if (out.changed) {
      await recordAudit(
        { actorSub, action: "shop.pack_scanning_changed", driverId: shopId, targetType: "shop", detail: { changed: ["packScanRequired"], values: { packScanRequired: required } } },
        tx,
      );
    }
    return { shopId, required };
  });
}
