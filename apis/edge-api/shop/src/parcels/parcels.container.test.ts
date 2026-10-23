import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 096 — the shop's bags against real PostgreSQL and the real migrations: declaring bags per zone (R3,
 * R4), voiding (bag 1 never; once printed, the last only), the print record, pack-scanning, and the
 * ready gate (FR-016, FR-022). Spec US1, US2, US4; quickstart Q1, Q2, Q5, Q6.
 */

const holder: { pool: Pool | null } = { pool: null };
vi.mock("@effy/edge-shared", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("@effy/edge-shared");
  return {
    ...actual,
    query: (text: string, params?: unknown[]) => holder.pool!.query(text, params as never[]),
    withTransaction: async (fn: (c: unknown) => unknown) => {
      const client = await holder.pool!.connect();
      try {
        await client.query("BEGIN");
        const out = await fn(client);
        await client.query("COMMIT");
        return out;
      } catch (e) {
        await client.query("ROLLBACK");
        throw e;
      } finally {
        client.release();
      }
    },
    presignRead: async (key: string) => `https://signed.example/${key}`,
  };
});
vi.mock("@effy/edge-shared/live", () => ({ announce: vi.fn(), announceMoves: vi.fn(), announceOrder: vi.fn() }));

import { createFirstParcels } from "@effy/edge-shared/labels";

import { transition } from "../fulfillments/service";
import { FulfillmentError } from "../fulfillments/types";
import { readOrder } from "../orders/repository";
import { declare, packScan, recordPrints, voidBag } from "./service";

const RUN = process.env.CONTAINER_TESTS === "1";

function applyMigrations(): string {
  const dir = resolve(import.meta.dirname, "../../../../../db/migrations");
  return readdirSync(dir).filter((f) => f.endsWith(".sql")).sort().map((f) => {
    const body = readFileSync(join(dir, f), "utf8");
    const rest = body.slice(Math.max(0, body.indexOf("-- +goose Up")));
    const end = rest.indexOf("-- +goose Down");
    return end < 0 ? rest : rest.slice(0, end);
  }).join("\n");
}

const CUST = "11111111-1111-4111-8111-111111111111";
const SHOP = "33333333-3333-4333-8333-333333333333";
const OTHER_SHOP = "33333333-3333-4333-8333-000000000000";
const STAFF = "77777777-7777-4777-8777-777777777777";
const actor = { sub: "sub-staff", shopId: SHOP, staffId: STAFF };
const cid = () => crypto.randomUUID();

async function refusal(p: Promise<unknown>): Promise<string | undefined> {
  try {
    await p;
    return undefined;
  } catch (e) {
    if (e instanceof FulfillmentError) return e.code ?? e.kind;
    throw e;
  }
}

describe.skipIf(!RUN)("096 — the shop's bags", () => {
  let container: StartedPostgreSqlContainer;
  let pool: Pool;
  let n = 0;

  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:16-alpine").start();
    pool = new Pool({ connectionString: container.getConnectionUri() });
    holder.pool = pool;
    await pool.query(applyMigrations());
  }, 180_000);

  afterAll(async () => {
    await pool?.end();
    await container?.stop();
  });

  beforeEach(async () => {
    await pool.query(`TRUNCATE public.customer, public.shop, public.product_type, public.category RESTART IDENTITY CASCADE`);
    await pool.query(`INSERT INTO public.customer (id, cognito_sub, email) VALUES ($1,'sub-c','a@b.c')`, [CUST]);
    await pool.query(`INSERT INTO public.shop (id, code, name) VALUES ($1,'S1','Shop One'), ($2,'S2','Shop Two')`, [SHOP, OTHER_SHOP]);
    await pool.query(`INSERT INTO public.shop_staff (id, cognito_sub, name, shop_id) VALUES ($1,'sub-staff','Maya',$2)`, [STAFF, SHOP]);
    await pool.query(`INSERT INTO public.product_type (key, name) VALUES ('grocery','Grocery')`);
    await pool.query(`INSERT INTO public.category (key, name) VALUES ('dairy','Dairy')`);
  });

  /** A paid order with one portion at `shop`, its lines in these storage classes. */
  async function order(classes: Array<"ambient" | "chilled" | "frozen"> = ["ambient"], shop = SHOP, status = "picking"): Promise<string> {
    n += 1;
    const o = await pool.query<{ id: string }>(
      `INSERT INTO public."order" (customer_id, order_number, status, item_subtotal_amount, grand_total_amount, delivery_address, placed_at)
       VALUES ($1, $2, 'paid', 10, 10, $3::jsonb, now()) RETURNING id`,
      [CUST, `EFY-P${String(n).padStart(4, "0")}`, JSON.stringify({ recipientName: "Amelia Thompson", line1: "14 Lydiard Street North", line2: "Unit 3",
        city: "Ballarat Central", region: "VIC", postalCode: "3350", country: "AU", phone: "0412 345 678" })],
    );
    for (const cls of classes) {
      const p = await pool.query<{ id: string }>(
        `WITH p AS (INSERT INTO public.product (shop_id, product_type_id, primary_category_id, name, short_description, created_by) SELECT $1, pt.id, c.id, 'Thing', 'x', 'seed' FROM public.product_type pt, public.category c RETURNING *),
     pv AS (INSERT INTO public.product_variant (product_id, shop_id, shop_price_amount, price_amount) SELECT p.id, p.shop_id, COALESCE(5, 5)::numeric, (5)::numeric FROM p RETURNING id)
SELECT id FROM p`, [shop],
      );
      await pool.query(
        `INSERT INTO public.order_item (order_id, product_id, variant_id, shop_id, product_name, unit_price_amount, quantity, line_subtotal_amount, storage_class)
         VALUES ($1, $2, (SELECT v.id FROM public.product_variant v WHERE v.product_id = ($2)::uuid ORDER BY v.position LIMIT 1), $3, 'Thing', 5, 1, 5, $4)`, [o.rows[0]!.id, p.rows[0]!.id, shop, cls],
      );
    }
    const f = await pool.query<{ id: string }>(
      `INSERT INTO public.shop_fulfillment (order_id, shop_id, status, item_count, subtotal_amount, delivery_method)
       VALUES ($1, $2, $3, 1, 10, 'same_day') RETURNING id`, [o.rows[0]!.id, shop, status],
    );
    await createFirstParcels(pool, { packageIds: [f.rows[0]!.id] });
    return f.rows[0]!.id;
  }

  const read = (fid: string) => readOrder(fid, SHOP);
  const printAll = async (fid: string) => {
    const d = await read(fid);
    await recordPrints(actor, { changeId: cid(), parcelIds: d.parcels.map((p) => p.parcelId), layout: "a6", path: "browser" });
  };

  it("a new package has bag 1 with its package code, in its coldest zone (R1)", async () => {
    const fid = await order(["ambient", "frozen"]);
    const d = await read(fid);
    expect(d.parcels).toEqual([expect.objectContaining({ seq: 1, of: 1, zone: "frozen", code: expect.stringMatching(/^[2-9A-HJKMNP-TV-Z]{6}$/), custody: "at_shop" })]);
    expect(d.labelCommon).toEqual({ service: "effy_driver", orderNumber: expect.any(String), packedOn: null, recipientName: "Amelia Thompson",
      line1: "14 Lydiard Street North", line2: "Unit 3", suburb: "Ballarat Central", state: "VIC", postcode: "3350",
      country: "AU", phone: "0412 345 678" });
    expect(d.zonesNeeded).toEqual(["frozen"]);
  });

  it("declares bags per zone: distinct codes, numbered 1..N, bag 1 kept (Q2)", async () => {
    const fid = await order(["ambient", "chilled", "frozen"]);
    const first = (await read(fid)).parcels[0]!;
    const d = await declare(actor, fid, { changeId: cid(), ambient: 2, chilled: 1, frozen: 1 });
    expect(d.parcels.map((p) => [p.seq, p.of])).toEqual([[1, 4], [2, 4], [3, 4], [4, 4]]);
    expect(new Set(d.parcels.map((p) => p.code)).size).toBe(4);
    expect(d.parcels[0]!.code).toBe(first.code);
    expect(d.parcels.map((p) => p.zone).sort()).toEqual(["ambient", "ambient", "chilled", "frozen"]);
    // A retry with the same counts changes nothing.
    const again = await declare(actor, fid, { changeId: cid(), ambient: 2, chilled: 1, frozen: 1 });
    expect(again.parcels.map((p) => p.code)).toEqual(d.parcels.map((p) => p.code));
  });

  it("refuses a declaration with no bag for a cold zone the lines need, and an empty one (Q1)", async () => {
    const fid = await order(["ambient", "frozen"]);
    expect(await refusal(declare(actor, fid, { changeId: cid(), ambient: 2, chilled: 0, frozen: 0 }))).toBe("zone_bag_required");
    expect(await refusal(declare(actor, fid, { changeId: cid(), ambient: 0, chilled: 0, frozen: 0 }))).toBe("parcel_count");
    expect(await refusal(declare(actor, fid, { changeId: cid(), ambient: 51, chilled: 0, frozen: 0 }))).toBe("validation");
  });

  it("voiding: bag 1 never; the last bag after printing; a middle bag after printing is refused (Q5)", async () => {
    const fid = await order(["ambient"]);
    let d = await declare(actor, fid, { changeId: cid(), ambient: 3, chilled: 0, frozen: 0 });
    expect(await refusal(voidBag(actor, fid, d.parcels[0]!.parcelId, { changeId: cid() }))).toBe("first_bag_not_voidable");
    // Before printing, a middle bag may go; the rest are renumbered.
    d = await voidBag(actor, fid, d.parcels[1]!.parcelId, { changeId: cid() });
    expect(d.parcels.map((p) => [p.seq, p.of])).toEqual([[1, 2], [2, 2]]);
    d = await declare(actor, fid, { changeId: cid(), ambient: 3, chilled: 0, frozen: 0 });
    await printAll(fid);
    d = await read(fid);
    expect(await refusal(voidBag(actor, fid, d.parcels[1]!.parcelId, { changeId: cid() }))).toBe("void_last_bag_only");
    d = await voidBag(actor, fid, d.parcels[2]!.parcelId, { changeId: cid() });
    expect(d.parcels.map((p) => [p.seq, p.of])).toEqual([[1, 2], [2, 2]]);
    // N changed: every remaining label must be printed again.
    expect(d.parcels.every((p) => !p.printed.current)).toBe(true);
    expect(d.parcels.every((p) => p.printed.count === 1)).toBe(true);
  });

  it("a re-declaration after printing renumbers and makes every label need printing again", async () => {
    const fid = await order(["ambient"]);
    await declare(actor, fid, { changeId: cid(), ambient: 3, chilled: 0, frozen: 0 });
    await printAll(fid);
    expect((await read(fid)).parcels.every((p) => p.printed.current)).toBe(true);
    const d = await declare(actor, fid, { changeId: cid(), ambient: 2, chilled: 0, frozen: 0 });
    expect(d.parcels.map((p) => [p.seq, p.of])).toEqual([[1, 2], [2, 2]]);
    expect(d.parcels.every((p) => !p.printed.current)).toBe(true);
  });

  it("nothing changes once a bag has left the shop", async () => {
    const fid = await order(["ambient"]);
    const d = await declare(actor, fid, { changeId: cid(), ambient: 2, chilled: 0, frozen: 0 });
    for (const step of ["collect", "courier_handover", "shop_pickup"]) {
      await pool.query(`TRUNCATE public.package_handover`);
      await pool.query(
        `INSERT INTO public.package_handover (shop_fulfillment_id, parcel_id, actor_kind, shop_staff_id, step, handover_method, change_id)
         VALUES ($1, $2, 'shop_staff', $3, $4, 'scan', gen_random_uuid())`, [fid, d.parcels[0]!.parcelId, STAFF, step],
      );
      expect(await refusal(declare(actor, fid, { changeId: cid(), ambient: 3, chilled: 0, frozen: 0 }))).toBe("parcels_with_driver");
      expect(await refusal(voidBag(actor, fid, d.parcels[1]!.parcelId, { changeId: cid() }))).toBe("parcels_with_driver");
    }
  });

  it("records prints once per change, refuses another shop's bag outright, and stamps the packed date", async () => {
    const fid = await order(["ambient"]);
    const other = await order(["ambient"], OTHER_SHOP);
    const d = await declare(actor, fid, { changeId: cid(), ambient: 2, chilled: 0, frozen: 0 });
    const ids = d.parcels.map((p) => p.parcelId);
    const theirs = (await pool.query<{ id: string }>(`SELECT id FROM public.package_parcel WHERE shop_fulfillment_id = $1`, [other])).rows[0]!.id;
    expect(await refusal(recordPrints(actor, { changeId: cid(), parcelIds: [...ids, theirs], layout: "a6", path: "browser" }))).toBe("not_found");
    expect(Number((await pool.query(`SELECT count(*) FROM public.label_print`)).rows[0].count)).toBe(0);
    const change = cid();
    expect(await recordPrints(actor, { changeId: change, parcelIds: ids, layout: "a6", path: "zpl" })).toEqual({ recorded: 2 });
    expect(await recordPrints(actor, { changeId: change, parcelIds: ids, layout: "a6", path: "zpl" })).toEqual({ recorded: 0 });
    const after = await read(fid);
    expect(after.parcels.every((p) => p.printed.current && p.printed.count === 1)).toBe(true);
    expect(after.labelCommon.packedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("the ready gate: unprinted bags, an undeclared cold portion, and required pack scanning", async () => {
    const cold = await order(["ambient", "frozen"]);
    expect(await refusal(transition(actor, cold, "ready_for_pickup"))).toBe("zone_bag_required");
    await declare(actor, cold, { changeId: cid(), ambient: 1, chilled: 0, frozen: 1 });
    expect(await refusal(transition(actor, cold, "ready_for_pickup"))).toBe("labels_not_printed");
    await printAll(cold);
    await pool.query(`UPDATE public.shop SET pack_scan_required = true WHERE id = $1`, [SHOP]);
    expect(await refusal(transition(actor, cold, "ready_for_pickup"))).toBe("bags_not_packed");
    const d = await read(cold);
    await packScan(actor, cold, {
      changeId: cid(),
      reads: d.parcels.map((p) => ({ clientReadId: cid(), raw: `EFY1:${p.code}`, method: "scan", outcome: "accepted", deviceAt: new Date().toISOString() })),
    });
    expect((await transition(actor, cold, "ready_for_pickup")).status).toBe("ready_for_pickup");
    // An ambient-only portion with bag 1 printed needs no declaration.
    await pool.query(`UPDATE public.shop SET pack_scan_required = false WHERE id = $1`, [SHOP]);
    const plain = await order(["ambient"]);
    await printAll(plain);
    expect((await transition(actor, plain, "ready_for_pickup")).status).toBe("ready_for_pickup");
  });

  it("pack-scanning: accepted once, another order's label refused and recorded, custody shows packed (Q6)", async () => {
    const fid = await order(["ambient"]);
    const other = await order(["ambient"]);
    const d = await declare(actor, fid, { changeId: cid(), ambient: 2, chilled: 0, frozen: 0 });
    const theirs = (await read(other)).parcels[0]!;
    const r = (code: string) => ({ clientReadId: cid(), raw: `EFY1:${code}`, method: "scan", outcome: "accepted", deviceAt: new Date().toISOString() });
    const out = await packScan(actor, fid, { changeId: cid(), reads: [r(d.parcels[0]!.code), r(theirs.code), r(d.parcels[0]!.code)] });
    expect(out.parcels.map((p) => [p.seq, p.packScanned !== null, p.custody])).toEqual([[1, true, "packed"], [2, false, "at_shop"]]);
    const outcomes = (await pool.query(`SELECT server_outcome FROM public.label_read`)).rows.map((x) => x.server_outcome);
    expect(outcomes.sort()).toEqual(["accepted", "already_counted", "not_on_this_work"]);
  });
});
