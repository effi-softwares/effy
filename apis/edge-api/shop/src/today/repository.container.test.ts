import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Today's SQL, against real PostgreSQL 16 and THE REAL MIGRATIONS (058).
 *
 * ⚠ WHY THIS FILE EXISTS. Every query in `repository.ts` is raw SQL across seven tables that five
 * slices own. A wrong column name TYPECHECKS PERFECTLY and passes every mocked test — 056 caught two
 * that way and only here — and an aggregate that joins one row too many produces a number that looks
 * entirely plausible on screen. The schema is applied from `db/migrations`, so a fixture cannot
 * agree with the code instead of with the platform (027 R13's failure mode).
 */

const holder: { pool: Pool | null } = { pool: null };
vi.mock("@effy/edge-shared", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("@effy/edge-shared");
  return { ...actual, query: (text: string, params?: unknown[]) => holder.pool!.query(text, params as never[]) };
});

import { readBacklog, readClock, readLiveOrders, readStockAttention } from "./repository";

const RUN = process.env.CONTAINER_TESTS === "1";

function applyMigrations(): string {
  const dir = resolve(import.meta.dirname, "../../../../../db/migrations");
  const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  if (files.length === 0) throw new Error("no migrations found — this harness would pass vacuously");
  return files
    .map((f) => {
      const body = readFileSync(join(dir, f), "utf8");
      const start = body.indexOf("-- +goose Up");
      const rest = start < 0 ? body : body.slice(start);
      const end = rest.indexOf("-- +goose Down");
      return end < 0 ? rest : rest.slice(0, end);
    })
    .join("\n");
}

const CUST = "11111111-1111-4111-8111-111111111111";
const SHOP = "33333333-3333-4333-8333-333333333333";
const OTHER_SHOP = "33333333-3333-4333-8333-000000000000";

describe.skipIf(!RUN)("Today's reads — real PostgreSQL, real migrations", () => {
  let container: StartedPostgreSqlContainer;
  let pool: Pool;

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
    await pool.query(`TRUNCATE public.customer, public.shop RESTART IDENTITY CASCADE`);
    await pool.query(`INSERT INTO public.customer (id, cognito_sub, email) VALUES ($1,'sub-c','a@b.c')`, [CUST]);
    await pool.query(
      `INSERT INTO public.shop (id, code, name) VALUES ($1,'S1','Shop One'), ($2,'S2','Shop Two')`,
      [SHOP, OTHER_SHOP],
    );
  });

  async function product(opts: {
    name: string;
    shop?: string;
    onHand?: number | null;
    threshold?: number | null;
    tracked?: boolean;
    status?: string;
  }): Promise<string> {
    const res = await pool.query<{ id: string }>(
      `INSERT INTO public.product (shop_id, name, slug, price_amount, status, stock_tracked,
         stock_on_hand, low_stock_threshold)
       VALUES ($1,$2,$3,10,$4,$5,$6,$7) RETURNING id`,
      [
        opts.shop ?? SHOP,
        opts.name,
        opts.name.toLowerCase().replace(/\W+/g, "-"),
        opts.status ?? "active",
        opts.tracked ?? true,
        opts.onHand ?? 0,
        opts.threshold ?? null,
      ],
    );
    return res.rows[0]!.id;
  }

  async function paidOrder(opts: {
    number: string;
    shop?: string;
    status?: string;
    minutesAgo?: number;
    qty?: number;
    total?: number;
    productId?: string;
  }): Promise<{ orderId: string; fulfillmentId: string }> {
    const shop = opts.shop ?? SHOP;
    const qty = opts.qty ?? 3;
    const total = opts.total ?? 30;
    const o = await pool.query<{ id: string }>(
      `INSERT INTO public."order" (customer_id, order_number, status, item_subtotal_amount,
         delivery_fee_amount, grand_total_amount, delivery_address, placed_at)
       VALUES ($1,$2,'paid',$3,0,$4,'{"recipientName":"Ada Lovelace"}'::jsonb,
               now() - make_interval(mins => $5)) RETURNING id`,
      [CUST, opts.number, total, total, opts.minutesAgo ?? 10],
    );
    const orderId = o.rows[0]!.id;
    const productId = opts.productId ?? (await product({ name: `P-${opts.number}`, shop }));
    await pool.query(
      `INSERT INTO public.order_item (order_id, product_id, shop_id, product_name, unit_price_amount,
         quantity, line_subtotal_amount) VALUES ($1,$2,$3,'Milk',10,$4,$5)`,
      [orderId, productId, shop, qty, qty * 10],
    );
    const f = await pool.query<{ id: string }>(
      `INSERT INTO public.shop_fulfillment (order_id, shop_id, status, item_count, subtotal_amount,
         delivery_method) VALUES ($1,$2,$3,$4,$5,'standard') RETURNING id`,
      [orderId, shop, opts.status ?? "received", qty, qty * 10],
    );
    return { orderId, fulfillmentId: f.rows[0]!.id };
  }

  describe("the backlog (FR-006 — the one value everything else quotes)", () => {
    it("counts awaiting-pick portions and THIS shop's units on them", async () => {
      await paidOrder({ number: "EFY-1", status: "pending", qty: 4 });
      await paidOrder({ number: "EFY-2", status: "received", qty: 7 });
      await paidOrder({ number: "EFY-3", status: "picking", qty: 5 }); // started — not awaiting
      await paidOrder({ number: "EFY-4", status: "ready_for_pickup", qty: 2 });

      const backlog = await readBacklog(SHOP);
      expect(backlog.awaitingPick.orders).toBe(2);
      expect(backlog.awaitingPick.units).toBe(11);
      expect(backlog.readyForPickup).toBe(1);
    });

    it("⚠ never counts another shop's portion or another shop's lines", async () => {
      await paidOrder({ number: "EFY-5", status: "received", qty: 3 });
      await paidOrder({ number: "EFY-6", status: "received", qty: 9, shop: OTHER_SHOP });

      const mine = await readBacklog(SHOP);
      const theirs = await readBacklog(OTHER_SHOP);
      expect(mine.awaitingPick).toMatchObject({ orders: 1, units: 3 });
      expect(theirs.awaitingPick).toMatchObject({ orders: 1, units: 9 });
    });

    it("reports the oldest waiting order as an instant, and null when nothing waits", async () => {
      const empty = await readBacklog(SHOP);
      expect(empty.awaitingPick.oldestPaidAt).toBeNull();

      await paidOrder({ number: "EFY-7", status: "received", minutesAgo: 192 });
      await paidOrder({ number: "EFY-8", status: "received", minutesAgo: 5 });
      const backlog = await readBacklog(SHOP);
      const ageMinutes = (Date.now() - backlog.awaitingPick.oldestPaidAt!.getTime()) / 60_000;
      expect(ageMinutes).toBeGreaterThan(190);
      expect(ageMinutes).toBeLessThan(195);
    });

    it("counts low stock with the SHARED rule: zero always, threshold when one is set", async () => {
      await product({ name: "Empty", onHand: 0 });
      await product({ name: "Thin", onHand: 3, threshold: 5 });
      await product({ name: "Fine", onHand: 40, threshold: 5 });
      await product({ name: "No opinion", onHand: 2 }); // tracked, no threshold, not empty
      await product({ name: "Untracked", onHand: 0, tracked: false });
      await product({ name: "Archived", onHand: 0, status: "archived" });

      const backlog = await readBacklog(SHOP);
      expect(backlog.lowStock).toEqual({ skus: 2, outOfStock: 1 });
    });
  });

  describe("stock attention", () => {
    it("carries real demand and derives cover from it", async () => {
      const id = await product({ name: "Stoneware mug", onHand: 3, threshold: 5 });
      await pool.query(
        `INSERT INTO public.stock_movement (product_id, shop_id, quantity_delta, quantity_before,
           quantity_after, reason, actor_kind)
         VALUES ($1,$2,-7,10,3,'order_paid','system')`,
        [id, SHOP],
      );

      const [row] = await readStockAttention(SHOP, 8);
      expect(row).toMatchObject({ name: "Stoneware mug", onHand: 3, soldLast7Days: 7, severity: "low" });
      // 7 units in 7 days = 1/day against 3 on hand.
      expect(row!.daysOfCover).toBe(3);
    });

    it("⚠ leaves cover NULL when nothing sold — zero would read as 'act now'", async () => {
      await product({ name: "Slow mover", onHand: 2, threshold: 5 });
      const [row] = await readStockAttention(SHOP, 8);
      expect(row!.soldLast7Days).toBe(0);
      expect(row!.daysOfCover).toBeNull();
    });

    it("ignores movements that are not sales, and sales older than a week", async () => {
      const id = await product({ name: "Wrap set", onHand: 0 });
      await pool.query(
        `INSERT INTO public.stock_movement (product_id, shop_id, quantity_delta, quantity_before,
           quantity_after, reason, actor_kind, created_at) VALUES
          ($1,$2,-4,10,6,'damage','shop', now()),
          ($1,$2,-9,6,0,'order_paid','system', now() - interval '20 days'),
          ($1,$2,-2,2,0,'order_paid','system', now() - interval '2 days')`,
        [id, SHOP],
      );
      const [row] = await readStockAttention(SHOP, 8);
      // A write-off is not appetite, and last month's sales are not this week's demand.
      expect(row!.soldLast7Days).toBe(2);
    });

    it("puts empty shelves above thin ones", async () => {
      await product({ name: "Thin", onHand: 2, threshold: 9 });
      await product({ name: "Empty", onHand: 0 });
      const rows = await readStockAttention(SHOP, 8);
      expect(rows.map((r) => r.name)).toEqual(["Empty", "Thin"]);
    });
  });

  describe("live orders", () => {
    it("returns the newest paid portions first, with this shop's unit count", async () => {
      await paidOrder({ number: "EFY-OLD", minutesAgo: 90, qty: 2 });
      await paidOrder({ number: "EFY-NEW", minutesAgo: 1, qty: 6 });

      const live = await readLiveOrders(SHOP, 5);
      expect(live.map((l) => l.orderNumber)).toEqual(["EFY-NEW", "EFY-OLD"]);
      expect(live[0]).toMatchObject({ itemCount: 6, customerName: "Ada Lovelace", currency: "AUD" });
    });

    it("⚠ every row carries the portion id its detail page opens (FR-009)", async () => {
      const { fulfillmentId } = await paidOrder({ number: "EFY-ID" });
      const [row] = await readLiveOrders(SHOP, 5);
      expect(row!.fulfillmentId).toBe(fulfillmentId);
    });

    it("never shows an unpaid order, and never another shop's", async () => {
      await pool.query(
        `INSERT INTO public."order" (customer_id, order_number, status, item_subtotal_amount,
           delivery_fee_amount, grand_total_amount, delivery_address)
         VALUES ($1,'EFY-UNPAID','pending_payment',10,0,10,'{"recipientName":"X"}'::jsonb)`,
        [CUST],
      );
      await paidOrder({ number: "EFY-THEIRS", shop: OTHER_SHOP });
      expect(await readLiveOrders(SHOP, 5)).toEqual([]);
    });
  });

  describe("the shop's clock", () => {
    it("returns the shop's zone, and refuses an unrecognised one rather than shifting the day", async () => {
      const ok = await readClock(SHOP);
      expect(ok.timezone).toBe("Australia/Melbourne");

      await pool.query(`UPDATE public.shop SET timezone = 'Mars/Olympus' WHERE id = $1`, [SHOP]);
      const bad = await readClock(SHOP);
      expect(bad.timezone).toBeNull();
      expect(bad.rawTimezone).toBe("Mars/Olympus");
    });
  });
});
