import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The rollups, against real PostgreSQL 16 and THE REAL MIGRATIONS (058, US3).
 *
 * ⚠ THE FIGURES ON THIS SCREEN ARE MONEY, and every one of them is produced by SQL that no mocked
 * test can check: a refund attributed to the wrong shop, a cancellation counted twice, a bucket
 * boundary half an hour out. All of those produce a number that looks entirely plausible. The only
 * way to know is to insert real rows, run the real job and check the arithmetic by hand.
 *
 * ⚠ AND IDEMPOTENCY IS THE LOAD-BEARING PROPERTY. The design's whole claim is that recomputing a
 * bucket is safe — run it twice, run it late, run it after a reversal. That is asserted here, not
 * assumed.
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

import { readHours, readTopProducts } from "./repository";
import { localParts } from "./window";
import { runRollup } from "./rollup";
import { runReconcile } from "./reconcile";
import { readInsights } from "./service";

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
const TZ = "Australia/Melbourne";

describe.skipIf(!RUN)("insight rollups — real PostgreSQL, real migrations", () => {
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
    await pool.query(
      `TRUNCATE public.customer, public.shop, public.product_type, public.category RESTART IDENTITY CASCADE`,
    );
    await pool.query(`DELETE FROM public.insights_dirty`);
    await pool.query(`DELETE FROM public.shop_sales_hour`);
    await pool.query(`DELETE FROM public.shop_product_sales_day`);
    await pool.query(`INSERT INTO public.customer (id, cognito_sub, email) VALUES ($1,'sub-c','a@b.c')`, [CUST]);
    await pool.query(
      `INSERT INTO public.shop (id, code, name) VALUES ($1,'S1','Shop One'), ($2,'S2','Shop Two')`,
      [SHOP, OTHER_SHOP],
    );
    await pool.query(`INSERT INTO public.product_type (key, name) VALUES ('grocery','Grocery')`);
    await pool.query(`INSERT INTO public.category (key, name) VALUES ('dairy','Dairy')`);
  });

  async function product(name: string, shop = SHOP): Promise<string> {
    const res = await pool.query<{ id: string }>(
      `INSERT INTO public.product (shop_id, product_type_id, primary_category_id, name, price_amount,
         short_description, created_by, status)
       SELECT $1, pt.id, c.id, $2, 10, 'x', 'seed', 'active'
         FROM public.product_type pt, public.category c
       RETURNING id`,
      [shop, name],
    );
    return res.rows[0]!.id;
  }

  /** A paid order at `minutesAgo`, with one line of `qty × $10` from `shop`. */
  async function paidOrder(opts: {
    number: string;
    shop?: string;
    minutesAgo?: number;
    qty?: number;
    productId?: string;
    status?: string;
  }): Promise<{ orderId: string; fulfillmentId: string; itemId: string }> {
    const shop = opts.shop ?? SHOP;
    const qty = opts.qty ?? 3;
    // ⚠ THE PRODUCTION PATH, NOT A SHORTCUT: an order is created `pending_payment` and only becomes
    // `paid` through an UPDATE inside FinalizeSucceeded (019). That UPDATE is what the trigger
    // watches, so a fixture that inserts a paid row directly marks no bucket and silently gives the
    // rollup nothing to do — which is exactly how this suite first came up empty.
    const o = await pool.query<{ id: string }>(
      `INSERT INTO public."order" (customer_id, order_number, status, item_subtotal_amount,
         delivery_fee_amount, grand_total_amount, delivery_address, placed_at)
       VALUES ($1,$2,'pending_payment',$3,5,$4,'{"recipientName":"Ada"}'::jsonb,
               now() - make_interval(mins => $5))
       RETURNING id`,
      [CUST, opts.number, qty * 10, qty * 10 + 5, opts.minutesAgo ?? 30],
    );
    const orderId = o.rows[0]!.id;
    const productId = opts.productId ?? (await product(`P-${opts.number}`, shop));
    const item = await pool.query<{ id: string }>(
      `INSERT INTO public.order_item (order_id, product_id, shop_id, product_name, unit_price_amount,
         quantity, line_subtotal_amount) VALUES ($1,$2,$3,'Milk',10,$4,$5) RETURNING id`,
      [orderId, productId, shop, qty, qty * 10],
    );
    const f = await pool.query<{ id: string }>(
      `INSERT INTO public.shop_fulfillment (order_id, shop_id, status, item_count, subtotal_amount)
       VALUES ($1,$2,'received',$3,$4) RETURNING id`,
      [orderId, shop, qty, qty * 10],
    );
    // The payment lands last, exactly as FinalizeSucceeded does it — and THAT is what marks the
    // bucket dirty. `opts.status` lets a test leave an order unpaid.
    await pool.query(`UPDATE public."order" SET status = $2 WHERE id = $1`, [
      orderId,
      opts.status ?? "paid",
    ]);
    return { orderId, fulfillmentId: f.rows[0]!.id, itemId: item.rows[0]!.id };
  }

  /** The calendar date an instant falls on IN THE SHOP'S ZONE — what `local_date` actually holds. */
  function shopDate(d: Date): string {
    const p = localParts(d, TZ);
    return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
  }

  async function currentWindow(): Promise<{ from: Date; to: Date }> {
    return { from: new Date(Date.now() - 36 * 3_600_000), to: new Date(Date.now() + 3_600_000) };
  }

  describe("goods and orders", () => {
    it("counts this shop's goods, and not the delivery fee", async () => {
      await paidOrder({ number: "EFY-1", qty: 3 }); // $30 goods, $35 total
      await runRollup();

      const { from, to } = await currentWindow();
      const rows = await readHours(SHOP, from, to);
      const gross = rows.reduce((n, r) => n + Number(r.grossGoods), 0);
      // ⚠ $30, not $35: the delivery fee is Effy's, set for the whole order, and counting it per shop
      // would count one fee in several shops' revenue (FR-032).
      expect(gross).toBe(30);
      expect(rows.reduce((n, r) => n + r.orders, 0)).toBe(1);
      expect(rows.reduce((n, r) => n + r.units, 0)).toBe(3);
    });

    it("⚠ never counts another shop's goods", async () => {
      await paidOrder({ number: "EFY-2", qty: 2 });
      await paidOrder({ number: "EFY-3", qty: 9, shop: OTHER_SHOP });
      await runRollup();

      const { from, to } = await currentWindow();
      const mine = await readHours(SHOP, from, to);
      const theirs = await readHours(OTHER_SHOP, from, to);
      expect(mine.reduce((n, r) => n + Number(r.grossGoods), 0)).toBe(20);
      expect(theirs.reduce((n, r) => n + Number(r.grossGoods), 0)).toBe(90);
    });

    it("ignores an unpaid order entirely", async () => {
      await paidOrder({ number: "EFY-4", status: "pending_payment" });
      await pool.query(
        `INSERT INTO public.insights_dirty (shop_id, bucket_start)
         SELECT $1, public.shop_local_hour(now(), $2) ON CONFLICT DO NOTHING`,
        [SHOP, TZ],
      );
      await runRollup();

      const { from, to } = await currentWindow();
      const rows = await readHours(SHOP, from, to);
      expect(rows.reduce((n, r) => n + Number(r.grossGoods), 0)).toBe(0);
    });
  });

  describe("refunds (FR-032 — dated when issued)", () => {
    it("attributes an item refund to the shop whose line it names", async () => {
      const { orderId, itemId } = await paidOrder({ number: "EFY-5", qty: 3 });
      const refund = await pool.query<{ id: string }>(
        `INSERT INTO public.refund (order_id, kind, amount, reason, idempotency_key, actor_kind,
           actor_sub, status)
         VALUES ($1,'item',10,'item_not_supplied','k-5','back_office','sub-staff','succeeded') RETURNING id`,
        [orderId],
      );
      await pool.query(
        `INSERT INTO public.refund_line (refund_id, order_item_id, quantity, amount)
         VALUES ($1,$2,1,10)`,
        [refund.rows[0]!.id, itemId],
      );
      await runRollup();

      const { from, to } = await currentWindow();
      const rows = await readHours(SHOP, from, to);
      expect(rows.reduce((n, r) => n + Number(r.refunds), 0)).toBe(10);
      // Revenue = goods − refunds issued in the window.
      expect(rows.reduce((n, r) => n + Number(r.grossGoods) - Number(r.refunds), 0)).toBe(20);
    });

    it("⚠ ignores goodwill and external refunds — they are Effy's gesture, not this shop's goods", async () => {
      const { orderId } = await paidOrder({ number: "EFY-6" });
      await pool.query(
        `INSERT INTO public.refund (order_id, kind, amount, reason, idempotency_key, actor_kind,
           actor_sub, note, status)
         VALUES ($1,'goodwill',15,'goodwill','k-6','back_office','sub-staff','a gesture','succeeded')`,
        [orderId],
      );
      await runRollup();

      const { from, to } = await currentWindow();
      const rows = await readHours(SHOP, from, to);
      // A shop cannot explain this from anything it did, so it must not appear in its revenue.
      expect(rows.reduce((n, r) => n + Number(r.refunds), 0)).toBe(0);
    });

    it("counts only refunds the provider has (submitted/succeeded)", async () => {
      const { orderId, itemId } = await paidOrder({ number: "EFY-7" });
      for (const [key, status] of [
        ["k-a", "submitting"],
        ["k-b", "failed"],
        ["k-c", "refused"],
      ] as const) {
        const r = await pool.query<{ id: string }>(
          `INSERT INTO public.refund (order_id, kind, amount, reason, idempotency_key, actor_kind,
             actor_sub, status, failure_reason)
           VALUES ($1,'item',10,'item_not_supplied',$2,'back_office','sub-staff',$3,
                   CASE WHEN $3 = 'failed' THEN 'provider declined' ELSE NULL END) RETURNING id`,
          [orderId, key, status],
        );
        await pool.query(
          `INSERT INTO public.refund_line (refund_id, order_item_id, quantity, amount) VALUES ($1,$2,1,10)`,
          [r.rows[0]!.id, itemId],
        );
      }
      await runRollup();

      const { from, to } = await currentWindow();
      const rows = await readHours(SHOP, from, to);
      // `submitting` may never leave; `failed`/`refused` never did. Only money on its way counts.
      expect(rows.reduce((n, r) => n + Number(r.refunds), 0)).toBe(0);
    });

    it("⚠ REVERSES when a submitted refund later fails — the one correction that reaches back", async () => {
      const { orderId, itemId } = await paidOrder({ number: "EFY-8" });
      const r = await pool.query<{ id: string }>(
        `INSERT INTO public.refund (order_id, kind, amount, reason, idempotency_key, actor_kind,
           actor_sub, status)
         VALUES ($1,'item',10,'item_not_supplied','k-8','back_office','sub-staff','submitted') RETURNING id`,
        [orderId],
      );
      await pool.query(
        `INSERT INTO public.refund_line (refund_id, order_item_id, quantity, amount) VALUES ($1,$2,1,10)`,
        [r.rows[0]!.id, itemId],
      );
      await runRollup();

      const { from, to } = await currentWindow();
      expect((await readHours(SHOP, from, to)).reduce((n, x) => n + Number(x.refunds), 0)).toBe(10);

      // 055: the bank can reject a refund up to thirty days later. The figure must go back.
      await pool.query(
        `UPDATE public.refund SET status = 'failed', failure_reason = 'the bank rejected it'
          WHERE id = $1`,
        [r.rows[0]!.id],
      );
      await runRollup();
      expect((await readHours(SHOP, from, to)).reduce((n, x) => n + Number(x.refunds), 0)).toBe(0);
    });

    it("splits a cancellation refund across the shops that supplied the order", async () => {
      const { orderId } = await paidOrder({ number: "EFY-9", qty: 2 }); // $20 from SHOP
      const p2 = await product("Other", OTHER_SHOP);
      await pool.query(
        `INSERT INTO public.order_item (order_id, product_id, shop_id, product_name, unit_price_amount,
           quantity, line_subtotal_amount) VALUES ($1,$2,$3,'Bread',10,4,40)`,
        [orderId, p2, OTHER_SHOP],
      );
      await pool.query(
        `INSERT INTO public.shop_fulfillment (order_id, shop_id, status, item_count, subtotal_amount)
         VALUES ($1,$2,'received',4,40)`,
        [orderId, OTHER_SHOP],
      );
      // A cancellation names no lines at all: it covers the whole order, delivery included.
      await pool.query(
        `INSERT INTO public.refund (order_id, kind, amount, reason, idempotency_key, actor_kind,
           actor_sub, status)
         VALUES ($1,'cancellation',65,'order_cancelled','k-9','back_office','sub-staff','succeeded')`,
        [orderId],
      );
      await runRollup();

      const { from, to } = await currentWindow();
      const mine = (await readHours(SHOP, from, to)).reduce((n, r) => n + Number(r.refunds), 0);
      const theirs = (await readHours(OTHER_SHOP, from, to)).reduce((n, r) => n + Number(r.refunds), 0);
      // Each shop carries its own goods back, and neither carries the $5 delivery fee.
      expect(mine).toBe(20);
      expect(theirs).toBe(40);
    });
  });

  describe("⚠ recomputation is idempotent", () => {
    it("gives identical rows when run twice, and when run again later", async () => {
      await paidOrder({ number: "EFY-10", qty: 4 });
      await runRollup();
      const { from, to } = await currentWindow();
      const first = await readHours(SHOP, from, to);

      // Re-mark and re-run: the whole design rests on this being safe.
      await pool.query(
        `INSERT INTO public.insights_dirty (shop_id, bucket_start)
         SELECT shop_id, bucket_start FROM public.shop_sales_hour WHERE shop_id = $1
         ON CONFLICT DO NOTHING`,
        [SHOP],
      );
      await runRollup();
      const second = await readHours(SHOP, from, to);

      expect(second.map((r) => ({ ...r, bucketStart: r.bucketStart.toISOString() }))).toEqual(
        first.map((r) => ({ ...r, bucketStart: r.bucketStart.toISOString() })),
      );
    });

    it("clears the queue it drained", async () => {
      await paidOrder({ number: "EFY-11" });
      const before = await pool.query(`SELECT COUNT(*)::int AS n FROM public.insights_dirty`);
      expect(before.rows[0]!.n).toBeGreaterThan(0);

      await runRollup();
      const after = await pool.query(`SELECT COUNT(*)::int AS n FROM public.insights_dirty`);
      expect(after.rows[0]!.n).toBe(0);
    });

    it("stamps the watermark the subtitle reports", async () => {
      await paidOrder({ number: "EFY-12" });
      await runRollup();
      const state = await pool.query<{ timezone: string; computed_at: Date }>(
        `SELECT timezone, computed_at FROM public.insights_state WHERE shop_id = $1`,
        [SHOP],
      );
      expect(state.rows[0]!.timezone).toBe(TZ);
      expect(Date.now() - state.rows[0]!.computed_at.getTime()).toBeLessThan(10_000);
    });
  });

  describe("top products", () => {
    it("ranks by goods sold and carries the product's CURRENT name", async () => {
      const a = await product("Linen apron");
      const b = await product("Stoneware mug");
      await paidOrder({ number: "EFY-13", qty: 5, productId: a });
      await paidOrder({ number: "EFY-14", qty: 2, productId: b });
      await runRollup();

      // ⚠ THE SHOP'S DATES, NOT THE MACHINE'S. `shop_product_sales_day.local_date` is a Melbourne
      // date, and `toISOString()` gives a UTC one — the same day only for part of the day, and for
      // developers in some timezones never. The first draft did exactly that and found nothing at
      // 17:17 UTC, when Melbourne had already turned over.
      const date = shopDate(new Date());
      const yesterday = shopDate(new Date(Date.now() - 86_400_000));
      const rows = await readTopProducts(SHOP, yesterday, date, 5);

      expect(rows[0]!.name).toBe("Linen apron");
      expect(rows[0]!.units).toBe(5);
      expect(Number(rows[0]!.revenue)).toBe(50);

      await pool.query(`UPDATE public.product SET name = 'Linen apron, sand' WHERE id = $1`, [a]);
      const renamed = await readTopProducts(SHOP, yesterday, date, 5);
      // A copied name would leave the operator searching the catalog for something that no longer
      // exists under that name.
      expect(renamed[0]!.name).toBe("Linen apron, sand");
    });
  });

  describe("the payload the screen renders", () => {
    it("reports figures, a comparison basis and a computed-at for a real shop", async () => {
      await paidOrder({ number: "EFY-15", qty: 3, minutesAgo: 20 });
      await runRollup();

      const dto = await readInsights({ shopId: SHOP }, "today", TZ, new Date());
      expect(dto.range).toBe("today");
      expect(dto.comparison.basis).toBe("same_weekday_last_week");
      expect(Number(dto.primary.revenue.value)).toBe(30);
      expect(dto.computedAt).not.toBeNull();
      // Nothing to compare against: last week is empty, and saying "+100%" would be a fiction.
      expect(dto.primary.revenue.change.kind).toBe("none");
      expect(dto.series.grain).toBe("hour");
      expect(dto.series.buckets.length).toBeGreaterThan(0);
    });

    it("⚠ a brand-new shop reads as zeros, never as an error", async () => {
      const dto = await readInsights({ shopId: OTHER_SHOP }, "7d", TZ, new Date());
      expect(Number(dto.primary.revenue.value)).toBe(0);
      expect(dto.topProducts).toEqual([]);
      // The rollups have never run for this shop, and the screen must say that rather than present
      // zeros as measurements.
      expect(dto.computedAt).toBeNull();
    });
  });

  describe("the nightly reconciliation", () => {
    it("finds nothing to correct when the rollups are current", async () => {
      await paidOrder({ number: "EFY-16" });
      await runRollup();

      const result = await runReconcile(2);
      // A non-zero count is the finding: it means a writer changed a figure without its bucket being
      // marked, which is a hole in the trigger path rather than a number to quietly repair.
      expect(result.corrections).toBe(0);
    });

    it("⚠ CATCHES a figure that changed without its bucket being marked", async () => {
      await paidOrder({ number: "EFY-17" });
      await runRollup();

      // Simulate the failure the triggers are supposed to make impossible: a write that leaves no
      // dirty mark behind.
      await pool.query(`ALTER TABLE public."order" DISABLE TRIGGER shop_ops_order_status`);
      await pool.query(`UPDATE public.shop_sales_hour SET gross_goods = 999 WHERE shop_id = $1`, [SHOP]);
      await pool.query(`ALTER TABLE public."order" ENABLE TRIGGER shop_ops_order_status`);

      const result = await runReconcile(2);
      expect(result.corrections).toBeGreaterThan(0);

      // And the repair goes through the ordinary path, so there is only ever one recomputation rule.
      await runRollup();
      const { from, to } = await currentWindow();
      const rows = await readHours(SHOP, from, to);
      expect(rows.reduce((n, r) => n + Number(r.grossGoods), 0)).toBe(30);
    });
  });
});
