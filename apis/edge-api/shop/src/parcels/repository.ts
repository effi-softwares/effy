// 096 — a package's bags, as the shop declares, voids, prints and pack-scans them (research R3, R4).
// Raw SQL, no ORM. Every write runs under the package row's lock, so two operators at one order
// cannot interleave a declaration with a print or a void.

import type pg from "pg";

import { withTransaction } from "@effy/edge-shared";
import { recordHandovers, recordReads, type RecordedRead } from "@effy/edge-shared/labels";
import { MAX_PARCELS, type LabelReadDTO, type ParcelZone } from "@effy/shared-types";

import { FulfillmentError } from "../fulfillments/types";

export interface ZoneCounts {
  ambient: number;
  chilled: number;
  frozen: number;
}

const ZONES: readonly ParcelZone[] = ["ambient", "chilled", "frozen"];

interface LiveRow {
  id: string;
  seq: number;
  zone: ParcelZone;
}

/** A refusal with its machine-readable name. */
const refuse = (kind: "conflict" | "unprocessable", code: string, sentence: string) =>
  new FulfillmentError(kind, sentence, undefined, code);

const notFound = () => new FulfillmentError("not_found", "order not found");

/** Lock this shop's package; refuse when it is not theirs. */
async function lockPackage(c: pg.PoolClient, fulfillmentId: string, shopId: string): Promise<{ status: string }> {
  const res = await c.query<{ status: string }>(
    `SELECT status FROM public.shop_fulfillment WHERE id = $1 AND shop_id = $2 FOR UPDATE`,
    [fulfillmentId, shopId],
  );
  if (res.rowCount === 0) throw notFound();
  return res.rows[0]!;
}

/**
 * ⚠ NOTHING CHANGES ONCE A BAG HAS LEFT THE SHOP — with a driver (`collect`), or with a courier
 * (`courier_handover`, `shop_pickup`). The labels are on bags in somebody else's hands by then.
 */
async function assertAtShop(c: pg.PoolClient, fulfillmentId: string): Promise<void> {
  const left = await c.query(
    `SELECT 1 FROM public.package_handover
      WHERE shop_fulfillment_id = $1 AND step IN ('collect', 'courier_handover', 'shop_pickup') LIMIT 1`,
    [fulfillmentId],
  );
  if ((left.rowCount ?? 0) > 0) {
    throw refuse("conflict", "parcels_with_driver", "These bags have already left the shop, so they can't be changed.");
  }
}

async function liveRows(c: pg.PoolClient, fulfillmentId: string): Promise<LiveRow[]> {
  const res = await c.query<LiveRow>(
    `SELECT id, seq, zone FROM public.package_parcel
      WHERE shop_fulfillment_id = $1 AND voided_at IS NULL ORDER BY seq`,
    [fulfillmentId],
  );
  return res.rows.map((r) => ({ ...r, seq: Number(r.seq) }));
}

async function anyPrinted(c: pg.PoolClient, fulfillmentId: string): Promise<boolean> {
  const res = await c.query(
    `SELECT 1 FROM public.label_print lp JOIN public.package_parcel p ON p.id = lp.parcel_id
      WHERE p.shop_fulfillment_id = $1 LIMIT 1`,
    [fulfillmentId],
  );
  return (res.rowCount ?? 0) > 0;
}

/** Which cold zones this package's lines need a bag for (065's line snapshot). */
async function zonesNeeded(c: pg.PoolClient, fulfillmentId: string): Promise<Set<ParcelZone>> {
  const res = await c.query<{ storage_class: string }>(
    `SELECT DISTINCT oi.storage_class
       FROM public.shop_fulfillment sf
       JOIN public.order_item oi ON oi.order_id = sf.order_id AND oi.shop_id = sf.shop_id
      WHERE sf.id = $1 AND oi.storage_class IN ('chilled', 'frozen')`,
    [fulfillmentId],
  );
  return new Set(res.rows.map((r) => r.storage_class as ParcelZone));
}

/**
 * Renumber the live bags 1..N in their current order. Ascending, so each bag moves down into a slot
 * already vacated — the live (package, seq) index is never violated mid-way. Bag 1 is always first.
 */
async function renumber(c: pg.PoolClient, fulfillmentId: string, bumpAll: boolean, changed: Set<string>, stamp = true): Promise<void> {
  const rows = await liveRows(c, fulfillmentId);
  for (const [i, r] of rows.entries()) {
    const seq = i + 1;
    if (r.seq !== seq) {
      await c.query(`UPDATE public.package_parcel SET seq = $2 WHERE id = $1`, [r.id, seq]);
      changed.add(r.id);
    }
  }
  if (!stamp) return;
  const ids = bumpAll ? rows.map((r) => r.id) : [...changed];
  if (ids.length > 0) {
    await c.query(`UPDATE public.package_parcel SET numbered_at = now() WHERE id = ANY($1::uuid[])`, [ids]);
  }
}

/**
 * Set the package's bags to these counts per zone (R4). Existing bags are kept where they fit, the rest
 * are voided (never bag 1, which is moved to a zone that has room), and new bags are added. A count that
 * changes the package's total makes every label need printing again.
 */
export async function declareParcels(fulfillmentId: string, shopId: string, counts: ZoneCounts): Promise<void> {
  await withTransaction(async (c) => {
    const pkg = await lockPackage(c, fulfillmentId, shopId);
    if (!["pending", "received", "picking", "ready_for_pickup"].includes(pkg.status)) {
      throw refuse("conflict", "parcels_with_driver", "This order has moved on, so its bags can't be changed.");
    }
    await assertAtShop(c, fulfillmentId);

    const needed = await zonesNeeded(c, fulfillmentId);
    for (const zone of needed) {
      if (counts[zone] === 0) {
        throw refuse("unprocessable", "zone_bag_required", `This order has ${zone} items, so it needs at least one ${zone} bag.`);
      }
    }

    const live = await liveRows(c, fulfillmentId);
    const room: ZoneCounts = { ...counts };
    const keep = new Map<string, ParcelZone>();
    const changed = new Set<string>();

    // Bag 1 first: it is never voided, so it takes a place in its own zone or moves to one with room.
    const first = live[0]!;
    const firstZone = room[first.zone] > 0 ? first.zone : ZONES.find((z) => room[z] > 0)!;
    keep.set(first.id, firstZone);
    room[firstZone] -= 1;
    if (firstZone !== first.zone) {
      await c.query(`UPDATE public.package_parcel SET zone = $2 WHERE id = $1`, [first.id, firstZone]);
      changed.add(first.id);
    }
    const toVoid: string[] = [];
    for (const r of live.slice(1)) {
      if (room[r.zone] > 0) {
        keep.set(r.id, r.zone);
        room[r.zone] -= 1;
      } else {
        toVoid.push(r.id);
      }
    }
    if (toVoid.length > 0) {
      await c.query(`UPDATE public.package_parcel SET voided_at = now() WHERE id = ANY($1::uuid[])`, [toVoid]);
    }
    // Close the gaps the voids left first, so new bags are numbered straight after (and within 1..50).
    await renumber(c, fulfillmentId, false, changed, false);
    let next = keep.size + 1;
    for (const zone of ZONES) {
      for (let i = 0; i < room[zone]; i++) {
        const ins = await c.query<{ id: string }>(
          `INSERT INTO public.package_parcel (shop_fulfillment_id, parcel_code, seq, zone, declared)
           VALUES ($1, public.new_parcel_code(), $2, $3, true) RETURNING id`,
          [fulfillmentId, next, zone],
        );
        changed.add(ins.rows[0]!.id);
        next += 1;
      }
    }
    const countChanged = live.length !== counts.ambient + counts.chilled + counts.frozen;
    await renumber(c, fulfillmentId, countChanged, changed);
    await c.query(
      `UPDATE public.package_parcel SET declared = true WHERE shop_fulfillment_id = $1 AND voided_at IS NULL AND NOT declared`,
      [fulfillmentId],
    );
  });
}

/**
 * Void one bag. Bag 1 never; once any label of the package is printed, only the last bag — voiding one
 * in the middle would leave a stuck label whose number matches no reprint (spec FR-006, R4).
 */
export async function voidParcel(fulfillmentId: string, shopId: string, parcelId: string, staffId: string | null): Promise<void> {
  await withTransaction(async (c) => {
    await lockPackage(c, fulfillmentId, shopId);
    const target = await c.query<{ seq: number; voided: boolean }>(
      `SELECT seq, voided_at IS NOT NULL AS voided FROM public.package_parcel WHERE id = $1 AND shop_fulfillment_id = $2`,
      [parcelId, fulfillmentId],
    );
    const row = target.rows[0];
    if (!row) throw notFound();
    if (row.voided) return; // already voided — a retry
    await assertAtShop(c, fulfillmentId);
    if (Number(row.seq) === 1) {
      throw refuse("conflict", "first_bag_not_voidable", "Bag 1 can't be removed. Change the number of bags instead.");
    }
    const live = await liveRows(c, fulfillmentId);
    const printed = await anyPrinted(c, fulfillmentId);
    if (printed && live[live.length - 1]!.id !== parcelId) {
      throw refuse("conflict", "void_last_bag_only",
        "Only the last bag can be removed once labels are printed. Change the number of bags and reprint every label.");
    }
    await c.query(
      `UPDATE public.package_parcel SET voided_at = now(), voided_by_staff_id = $2 WHERE id = $1`,
      [parcelId, staffId],
    );
    // N changed: every remaining label says "of" the old count.
    await renumber(c, fulfillmentId, true, new Set());
  });
}

/** Record prints of these bags (FR-015). The whole call is refused if any bag is not this shop's. */
export async function recordPrints(
  shopId: string,
  staffId: string | null,
  parcelIds: readonly string[],
  layout: "a6" | "a4x4" | "roll62",
  path: "browser" | "zpl",
  changeId: string,
): Promise<{ recorded: number; fulfillmentIds: string[] }> {
  return withTransaction(async (c) => {
    const own = await c.query<{ id: string; shop_fulfillment_id: string }>(
      `SELECT p.id, p.shop_fulfillment_id
         FROM public.package_parcel p JOIN public.shop_fulfillment sf ON sf.id = p.shop_fulfillment_id
        WHERE p.id = ANY($1::uuid[]) AND sf.shop_id = $2 AND p.voided_at IS NULL`,
      [parcelIds, shopId],
    );
    if (own.rowCount !== new Set(parcelIds).size) throw notFound();
    const res = await c.query(
      `INSERT INTO public.label_print (parcel_id, shop_staff_id, layout, path, change_id)
       SELECT id, $2, $3, $4, $5 FROM unnest($1::uuid[]) AS id
       ON CONFLICT (change_id, parcel_id) DO NOTHING`,
      [[...new Set(parcelIds)], staffId, layout, path, changeId],
    );
    return { recorded: res.rowCount ?? 0, fulfillmentIds: [...new Set(own.rows.map((r) => r.shop_fulfillment_id))] };
  });
}

/**
 * Pack confirmation (FR-020): each read of THIS package's label marks that bag packed and records a
 * `pack` hand-over; a label of another package is refused with a sentence and recorded.
 */
export async function packScan(
  fulfillmentId: string,
  shopId: string,
  staffId: string,
  changeId: string,
  reads: ReadonlyArray<Partial<LabelReadDTO>>,
): Promise<RecordedRead[]> {
  return withTransaction(async (c) => {
    await lockPackage(c, fulfillmentId, shopId);
    const live = await liveRows(c, fulfillmentId);
    const liveIds = new Set(live.map((r) => r.id));
    const packed = new Set(
      (await c.query<{ id: string }>(
        `SELECT id FROM public.package_parcel WHERE shop_fulfillment_id = $1 AND pack_scanned_at IS NOT NULL`, [fulfillmentId],
      )).rows.map((r) => r.id),
    );
    const recorded = await recordReads(c, {
      actor: { kind: "shop_staff", staffId },
      surface: "shop_web",
      step: "pack",
      reads,
      judge: (bag) => {
        if (!liveIds.has(bag.parcelId)) return "not_on_this_work";
        if (packed.has(bag.parcelId)) return "already_counted";
        packed.add(bag.parcelId); // the same label twice in one request counts once
        return "accepted";
      },
    });
    const accepted = recorded.filter((r) => r.serverOutcome === "accepted" && r.resolved?.kind === "parcel");
    if (accepted.length > 0) {
      const ids = [...new Set(accepted.map((r) => (r.resolved as { parcelId: string }).parcelId))];
      await c.query(
        `UPDATE public.package_parcel SET pack_scanned_at = now(), pack_scanned_by_staff_id = $2
          WHERE id = ANY($1::uuid[]) AND pack_scanned_at IS NULL`,
        [ids, staffId],
      );
      const byId = new Map(accepted.map((r) => [(r.resolved as { parcelId: string }).parcelId, r]));
      await recordHandovers(c, {
        step: "pack",
        actor: { kind: "shop_staff", staffId },
        changeId,
        parcels: ids.map((id) => ({ parcelId: id, method: reads.find((x) => x.clientReadId === byId.get(id)!.clientReadId)?.method === "typed" ? "typed" : "scan" })),
        allowed: new Map(ids.map((id) => [id, fulfillmentId])),
      });
    }
    return recorded;
  });
}

/**
 * The ready gate (FR-016, FR-022, R4), inside the transition's own transaction so a print recorded at
 * the same moment is seen. Throws the named refusal; returns quietly when the portion may be ready.
 */
export async function assertReadyForPickup(c: pg.PoolClient, fulfillmentId: string): Promise<void> {
  const res = await c.query<{ live: number; unprinted: number; unpacked: number; declared: boolean; scan_required: boolean }>(
    `SELECT count(*)::int AS live,
            count(*) FILTER (WHERE NOT EXISTS (SELECT 1 FROM public.label_print lp
                                                WHERE lp.parcel_id = p.id AND lp.printed_at >= p.numbered_at))::int AS unprinted,
            count(*) FILTER (WHERE p.pack_scanned_at IS NULL)::int AS unpacked,
            bool_or(p.declared) AS declared,
            bool_or(s.pack_scan_required) AS scan_required
       FROM public.package_parcel p
       JOIN public.shop_fulfillment sf ON sf.id = p.shop_fulfillment_id
       JOIN public.shop s ON s.id = sf.shop_id
      WHERE p.shop_fulfillment_id = $1 AND p.voided_at IS NULL`,
    [fulfillmentId],
  );
  const g = res.rows[0]!;
  if (!g.declared && (await zonesNeeded(c, fulfillmentId)).size > 0) {
    throw refuse("conflict", "zone_bag_required", "This order has chilled or frozen items. Say how many bags of each you packed first.");
  }
  if (g.unprinted > 0) {
    throw refuse("conflict", "labels_not_printed",
      `${g.unprinted} bag${g.unprinted === 1 ? " has" : "s have"} no printed label yet. Print every label first.`);
  }
  if (g.scan_required && g.unpacked > 0) {
    throw refuse("conflict", "bags_not_packed",
      `${g.unpacked} bag${g.unpacked === 1 ? " hasn't" : "s haven't"} been scanned as packed yet.`);
  }
}

export { MAX_PARCELS };
