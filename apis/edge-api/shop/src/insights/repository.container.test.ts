import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { migrationSql } from "@effy/edge-shared/testing";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The rollups against real Postgres: the figures are money, and each is checked by hand. Recomputing a
 * bucket twice, late or after a reversal must be safe.
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
    await pool.query(migrationSql());
  }, 180_000);

  afterAll(async () => {
    await pool?.end();
    await container?.stop();
  });

  beforeEach(async () => {
    await pool.query(
      `TRUNCATE public.customer, public.shop, public.category RESTART IDENTITY CASCADE`,
    );
    await pool.query(`DELETE FROM public.insights_dirty`);
    await pool.query(`DELETE FROM public.shop_sales_hour`);
    await pool.query(`DELETE FROM public.shop_product_sales_day`);
    await pool.query(`INSERT INTO public.customer (id, cognito_sub, email) VALUES ($1,'sub-c','a@b.c')`, [CUST]);
    await pool.query(
      `INSERT INTO public.shop (id, code, name) VALUES ($1,'S1','Shop One'), ($2,'S2','Shop Two')`,
      [SHOP, OTHER_SHOP],
    );
    await pool.query(`INSERT INTO public.category (key, name) VALUES ('dairy','Dairy')`);
  });

  async function product(name: string, shop = SHOP): Promise<string> {
    const res = await pool.query<{ id: string }>(
      `WITH p AS (INSERT INTO public.product (shop_id, primary_category_id, storage, gst_status, age_restricted, name, short_description, created_by, status, approved_at) SELECT $1, c.id, 'ambient', 'gst_free', false, $2, 'x', 'seed', 'active', now() FROM (SELECT id FROM public.category ORDER BY created_at, id LIMIT 1) c RETURNING *),
     pv AS (INSERT INTO public.product_variant (product_id, shop_id, shop_price_amount, price_amount) SELECT p.id, p.shop_id, COALESCE(10, 10)::numeric, (10)::numeric FROM p RETURNING id)
SELECT id FROM p`,
      [shop, name],
    );
    return res.rows[0]!.id;
  }

  /** Paid `minutesAgo`, with one line of `qty × $10` from `shop`. */
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
    // The production path: created `pending_payment`, then the UPDATE to `paid` the trigger watches.
    const o = await pool.query<{ id: string }>(
      `INSERT INTO public."order" (customer_id, order_number, status, item_subtotal_amount,
         delivery_fee_amount, grand_total_amount, delivery_address, placed_at, delivery_type, delivery_type_reason)
       VALUES ($1,$2,'pending_payment',$3,5,$4,'{"recipientName":"Ada"}'::jsonb,
               now() - make_interval(mins => $5), 'effy', 'in_coverage')
       RETURNING id`,
      [CUST, opts.number, qty * 10, qty * 10 + 5, opts.minutesAgo ?? 30],
    );
    const orderId = o.rows[0]!.id;
    const productId = opts.productId ?? (await product(`P-${opts.number}`, shop));
    const item = await pool.query<{ id: string }>(
      `INSERT INTO public.order_item (order_id, product_id, variant_id, shop_id, product_name, unit_price_amount, quantity, line_subtotal_amount, shop_unit_price_amount, shop_line_subtotal_amount) VALUES ($1, $2, (SELECT v.id FROM public.product_variant v WHERE v.product_id = ($2)::uuid ORDER BY v.position LIMIT 1), $3, 'Milk', 10, $4, $5, 10, $5) RETURNING id`,
      [orderId, productId, shop, qty, qty * 10],
    );
    const f = await pool.query<{ id: string }>(
      `INSERT INTO public.shop_fulfillment (order_id, shop_id, status, item_count, subtotal_amount)
       VALUES ($1,$2,'received',$3,$4) RETURNING id`,
      [orderId, shop, qty, qty * 10],
    );
    // The payment lands last and marks the bucket dirty; `opts.status` can leave an order unpaid.
    await pool.query(`UPDATE public."order" SET status = $2 WHERE id = $1`, [
      orderId,
      opts.status ?? "paid",
    ]);
    return { orderId, fulfillmentId: f.rows[0]!.id, itemId: item.rows[0]!.id };
  }

  /** The calendar date in the shop's zone, as `local_date` holds it. */
  function shopDate(d: Date): string {
    const p = localParts(d, TZ);
    return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
  }

  async function currentWindow(): Promise<{ from: Date; to: Date }> {
    return { from: new Date(Date.now() - 36 * 3_600_000), to: new Date(Date.now() + 3_600_000) };
  }

  describe("goods and orders", () => {
    it("counts this shop's goods, and not the delivery fee", async () => {
      await paidOrder({ number: "EFY-1", qty: 3 });
      await runRollup();

      const { from, to } = await currentWindow();
      const rows = await readHours(SHOP, from, to);
      const gross = rows.reduce((n, r) => n + Number(r.grossGoods), 0);
      // $30, not $35: the delivery fee is Effy's, never counted per shop.
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

  // A shop's sales are at the shop's prices.
  describe("067 — the shop's own prices", () => {
    /** Every line sold at a customer price above what the shop is owed. */
    async function withMargin(orderId: string, shopUnit: number): Promise<void> {
      await pool.query(
        `UPDATE public.order_item
            SET shop_unit_price_amount = $2::numeric, shop_line_subtotal_amount = $2::numeric * quantity
          WHERE order_id = $1`,
        [orderId, shopUnit],
      );
      // That UPDATE bypasses the order trigger, so mark the bucket as the job would see it.
      await pool.query(
        `INSERT INTO public.insights_dirty (shop_id, bucket_start)
         SELECT $1, public.shop_local_hour(now() - interval '30 minutes', $2) ON CONFLICT DO NOTHING`,
        [SHOP, TZ],
      );
    }

    /** The customer paid $10 a unit, the shop is owed $8: the shop's sales say $8. */
    it("⚠ reports goods at what the shop is owed, not what the customer paid", async () => {
      const { orderId } = await paidOrder({ number: "EFY-M1", qty: 3 });
      await withMargin(orderId, 8);
      await runRollup();

      const { from, to } = await currentWindow();
      const rows = await readHours(SHOP, from, to);
      expect(rows.reduce((n, r) => n + Number(r.grossGoods), 0)).toBe(24);
      expect(rows.reduce((n, r) => n + r.units, 0)).toBe(3);
    });

    it("attributes an item refund to the shop at ITS price for the units refunded", async () => {
      const { orderId, itemId } = await paidOrder({ number: "EFY-M2", qty: 3 });
      await withMargin(orderId, 8);
      const refund = await pool.query<{ id: string }>(
        `INSERT INTO public.refund (order_id, kind, amount, reason, idempotency_key, actor_kind,
           actor_sub, status)
         VALUES ($1,'item',10,'item_not_supplied','k-m2','back_office','sub-staff','succeeded') RETURNING id`,
        [orderId],
      );
      // The customer got $10 back for one unit; the shop's sales fall by the $8 it was owed for it.
      await pool.query(
        `INSERT INTO public.refund_line (refund_id, order_item_id, quantity, amount) VALUES ($1,$2,1,10)`,
        [refund.rows[0]!.id, itemId],
      );
      await runRollup();

      const { from, to } = await currentWindow();
      const rows = await readHours(SHOP, from, to);
      expect(rows.reduce((n, r) => n + Number(r.refunds), 0)).toBe(8);
      expect(rows.reduce((n, r) => n + Number(r.grossGoods) - Number(r.refunds), 0)).toBe(16);
    });

    it("the top-products ranking uses the shop's prices too", async () => {
      const productId = await product("Margined milk");
      const { orderId } = await paidOrder({ number: "EFY-M4", qty: 5, productId });
      await withMargin(orderId, 6);
      await runRollup();

      const top = await readTopProducts(SHOP, shopDate(new Date(Date.now() - 86_400_000)), shopDate(new Date()), 10);
      expect(Number(top.find((p) => p.productId === productId)?.revenue)).toBe(30);
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
      // A shop cannot explain it from anything it did, so it is not in its revenue.
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

      // The bank can reject a refund up to thirty days later: the figure must go back.
      await pool.query(
        `UPDATE public.refund SET status = 'failed', failure_reason = 'the bank rejected it'
          WHERE id = $1`,
        [r.rows[0]!.id],
      );
      await runRollup();
      expect((await readHours(SHOP, from, to)).reduce((n, x) => n + Number(x.refunds), 0)).toBe(0);
    });

    it("splits a cancellation refund across the shops that supplied the order", async () => {
      const { orderId } = await paidOrder({ number: "EFY-9", qty: 2 });
      const p2 = await product("Other", OTHER_SHOP);
      await pool.query(
        `INSERT INTO public.order_item (order_id, product_id, variant_id, shop_id, product_name, unit_price_amount, quantity, line_subtotal_amount, shop_unit_price_amount, shop_line_subtotal_amount) VALUES ($1, $2, (SELECT v.id FROM public.product_variant v WHERE v.product_id = ($2)::uuid ORDER BY v.position LIMIT 1), $3, 'Bread', 10, 4, 40, 10, 40)`,
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

      // Re-mark and re-run: the design rests on this being safe.
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

      // The shop's dates, not utc's: `local_date` is a Melbourne date.
      const date = shopDate(new Date());
      const yesterday = shopDate(new Date(Date.now() - 86_400_000));
      const rows = await readTopProducts(SHOP, yesterday, date, 5);

      expect(rows[0]!.name).toBe("Linen apron");
      expect(rows[0]!.units).toBe(5);
      expect(Number(rows[0]!.revenue)).toBe(50);

      await pool.query(`UPDATE public.product SET name = 'Linen apron, sand' WHERE id = $1`, [a]);
      const renamed = await readTopProducts(SHOP, yesterday, date, 5);
      // The current name, not a copy.
      expect(renamed[0]!.name).toBe("Linen apron, sand");
    });
  });

  describe("the payload the screen renders", () => {
    it("reports figures, a comparison basis and a computed-at for a real shop", async () => {
      await paidOrder({ number: "EFY-15", qty: 3, minutesAgo: 0 });
      await runRollup();

      const dto = await readInsights({ shopId: SHOP }, "today", TZ, new Date());
      expect(dto.range).toBe("today");
      expect(dto.comparison.basis).toBe("same_weekday_last_week");
      expect(Number(dto.primary.revenue.value)).toBe(30);
      expect(dto.computedAt).not.toBeNull();
      // Nothing to compare against: "+100%" would be a fiction.
      expect(dto.primary.revenue.change.kind).toBe("none");
      expect(dto.series.grain).toBe("hour");
      expect(dto.series.buckets.length).toBeGreaterThan(0);
    });

    it("⚠ a brand-new shop reads as zeros, never as an error", async () => {
      const dto = await readInsights({ shopId: OTHER_SHOP }, "7d", TZ, new Date());
      expect(Number(dto.primary.revenue.value)).toBe(0);
      expect(dto.topProducts).toEqual([]);
      // Never run for this shop: the screen says so rather than show zeros.
      expect(dto.computedAt).toBeNull();
    });
  });

  describe("the nightly reconciliation", () => {
    it("finds nothing to correct when the rollups are current", async () => {
      await paidOrder({ number: "EFY-16" });
      await runRollup();

      const result = await runReconcile(2);
      // A non-zero count is the finding: a hole in the trigger path.
      expect(result.corrections).toBe(0);
    });

    it("⚠ CATCHES a figure that changed without its bucket being marked", async () => {
      await paidOrder({ number: "EFY-17" });
      await runRollup();

      // A write that leaves no dirty mark, which the triggers should make impossible.
      await pool.query(`ALTER TABLE public."order" DISABLE TRIGGER shop_ops_order_status`);
      await pool.query(`UPDATE public.shop_sales_hour SET gross_goods = 999 WHERE shop_id = $1`, [SHOP]);
      await pool.query(`ALTER TABLE public."order" ENABLE TRIGGER shop_ops_order_status`);

      const result = await runReconcile(2);
      expect(result.corrections).toBeGreaterThan(0);

      // Repaired through the ordinary path: one recomputation rule.
      await runRollup();
      const { from, to } = await currentWindow();
      const rows = await readHours(SHOP, from, to);
      expect(rows.reduce((n, r) => n + Number(r.grossGoods), 0)).toBe(30);
    });
  });

  describe("099 — how well the shop fulfils", () => {
    /** Moves the portion like the console does: an event per step, the status last (which marks the hour). */
    async function step(fulfillmentId: string, to: string): Promise<void> {
      await pool.query(
        `INSERT INTO public.fulfillment_event (shop_fulfillment_id, event_type, to_status) VALUES ($1, 'state_changed', $2)`,
        [fulfillmentId, to],
      );
      await pool.query(
        `UPDATE public.shop_fulfillment
            SET status = $2, unfulfillable_reason = CASE WHEN $2 = 'unfulfillable' THEN 'Out of stock' END
          WHERE id = $1`,
        [fulfillmentId, to],
      );
    }

    async function picked(p: { fulfillmentId: string; itemId: string }, ordered: number, gathered: number): Promise<void> {
      await pool.query(
        `INSERT INTO public.fulfillment_item (shop_fulfillment_id, order_item_id, ordered_quantity, gathered_quantity, unavailable_quantity)
         VALUES ($1, $2, $3, $4, $5)`,
        [p.fulfillmentId, p.itemId, ordered, gathered, ordered - gathered],
      );
    }

    it("counts each finished portion once, its units supplied, and its time to ready — never a cancelled one", async () => {
      const a = await paidOrder({ number: "Q-A", qty: 4, minutesAgo: 30 });
      await picked(a, 4, 3);
      await step(a.fulfillmentId, "ready_for_pickup");
      // Reopened and readied again: still one finished portion, timed at its FIRST ready.
      await step(a.fulfillmentId, "picking");
      await step(a.fulfillmentId, "ready_for_pickup");

      const b = await paidOrder({ number: "Q-B", qty: 2, minutesAgo: 30 });
      await picked(b, 2, 0);
      await step(b.fulfillmentId, "unfulfillable");

      const c = await paidOrder({ number: "Q-C", qty: 5, minutesAgo: 30 });
      await picked(c, 5, 5);
      await step(c.fulfillmentId, "ready_for_pickup");
      await step(c.fulfillmentId, "withdrawn");

      await runRollup();
      const { from, to } = await currentWindow();
      const rows = await readHours(SHOP, from, to);
      const total = (k: "finishedOrders" | "finishedUnitsOrdered" | "finishedUnitsSupplied" | "readyOrders" | "readySeconds") =>
        rows.reduce((n, r) => n + r[k], 0);
      expect(total("finishedOrders")).toBe(2);
      expect(total("finishedUnitsOrdered")).toBe(6);
      expect(total("finishedUnitsSupplied")).toBe(3);
      expect(total("readyOrders")).toBe(1);
      // Paid 30 minutes ago, ready now.
      expect(total("readySeconds")).toBeGreaterThanOrEqual(29 * 60);
      expect(total("readySeconds")).toBeLessThanOrEqual(31 * 60);
    });
  });
});
