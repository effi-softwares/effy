import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { migrationSql } from "@effy/edge-shared/testing";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const holder = vi.hoisted(() => ({ pool: null as Pool | null }));

// The shared `db` module is mocked, not the package entry: modules inside the package import it by
// relative path, and mocking the entry would replace every other export too.
vi.mock("../../../shared/src/lib/db", () => ({
  query: (text: string, params?: unknown[]) => holder.pool!.query(text, params as never[]),
  withTransaction: async (fn: (c: unknown) => unknown) => fn(holder.pool),
  pingDatabase: async () => undefined,
}));

import { proposedRefunds, refundRequest, refunds } from "./refunds";
import { getOrder } from "./service";

const RUN = process.env.CONTAINER_TESTS === "1";

const CUST = "11111111-1111-4111-8111-111111111111";
const ORDER = "22222222-2222-4222-8222-222222222222";
const SHOP = "33333333-3333-4333-8333-333333333333";
const ITEM = "44444444-4444-4444-8444-444444444444";
const FULFILMENT = "55555555-5555-4555-8555-555555555555";
const PRODUCT = "66666666-6666-4666-8666-666666666666";

describe.skipIf(!RUN)("refund reads - against real PostgreSQL and the real migrations", () => {
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
    await pool.query(`TRUNCATE public.customer, public.shop, public.category RESTART IDENTITY CASCADE`);
    await pool.query(
      `INSERT INTO public.customer (id, cognito_sub, email) VALUES ($1,'sub-1','a@b.c')`, [CUST]);
    await pool.query(
      `INSERT INTO public.shop (id, code, name) VALUES ($1,'S1','Shop One')`, [SHOP]);
    await pool.query(
      `INSERT INTO public."order" (id, customer_id, order_number, status, item_subtotal_amount,
         delivery_fee_amount, grand_total_amount, delivery_address, delivery_type, delivery_type_reason)
       VALUES ($1,$2,'EFY-R1','paid',30,0,30,'{}'::jsonb, 'effy', 'in_coverage')`, [ORDER, CUST]);
    await pool.query(
      `INSERT INTO public.payment (order_id, stripe_payment_intent_id, amount, status)
       VALUES ($1,'pi_r1',30,'succeeded')`, [ORDER]);
    // A real product and category: `order_item.product_id` has a foreign key.
    await pool.query(
      `INSERT INTO public.category (id, key, name) VALUES (gen_random_uuid(),'dairy','Dairy')
       ON CONFLICT DO NOTHING`);
    await pool.query(
      `WITH p AS (INSERT INTO public.product (id, shop_id, primary_category_id, storage, gst_status, age_restricted, name, short_description, created_by) SELECT $1, $2, c.id, 'ambient', 'gst_free', false, 'Milk', 'Fresh milk', 'seed' FROM public.category c
        WHERE c.key = 'dairy' RETURNING *),
     pv AS (INSERT INTO public.product_variant (product_id, shop_id, shop_price_amount, price_amount) SELECT p.id, p.shop_id, COALESCE(10, 10)::numeric, (10)::numeric FROM p RETURNING id)
SELECT p.id FROM p`, [PRODUCT, SHOP]);
    await pool.query(
      `INSERT INTO public.order_item (id, order_id, product_id, variant_id, shop_id, product_name, unit_price_amount, quantity, line_subtotal_amount, shop_unit_price_amount, shop_line_subtotal_amount)
       VALUES ($1, $2, $3, (SELECT v.id FROM public.product_variant v WHERE v.product_id = ($3)::uuid ORDER BY v.position LIMIT 1), $4, 'Milk', 10, 3, 30, 10, 30)`, [ITEM, ORDER, PRODUCT, SHOP]);
    await pool.query(
      `INSERT INTO public.shop_fulfillment (id, order_id, shop_id, item_count, subtotal_amount)
       VALUES ($1,$2,$3,3,30)`, [FULFILMENT, ORDER, SHOP]);
  });

  async function recordShortfall(unavailable: number) {
    await pool.query(
      `INSERT INTO public.fulfillment_item (shop_fulfillment_id, order_item_id, ordered_quantity, unavailable_quantity)
       VALUES ($1,$2,3,$3)
       ON CONFLICT (shop_fulfillment_id, order_item_id)
       DO UPDATE SET unavailable_quantity = EXCLUDED.unavailable_quantity`,
      [FULFILMENT, ITEM, unavailable]);
  }

  describe("a pick shortfall proposes a refund (FR-004a)", () => {
    it("derives the items and the amount from the shortfall and the receipt", async () => {
      await recordShortfall(2);
      const rows = await proposedRefunds(ORDER);

      expect(rows).toHaveLength(1);
      expect(rows[0]!.quantity).toBe(2);
      // Priced from the receipt line, so a later price change cannot change what is owed.
      expect(rows[0]!.amount).toBe("20.00");
      expect(rows[0]!.product_name).toBe("Milk");
    });

    // The proposal is derived, so editing the shortfall re-derives it.
    it("yields ONE proposal however many times the picker edits the shortfall", async () => {
      await recordShortfall(1);
      await recordShortfall(2);
      await recordShortfall(3);

      const rows = await proposedRefunds(ORDER);
      expect(rows).toHaveLength(1);
      expect(rows[0]!.quantity, "the latest shortfall, not three stale proposals").toBe(3);
    });

    it("disappears once the shortfall is refunded", async () => {
      await recordShortfall(2);
      const { rows } = await pool.query<{ id: string }>(
        `INSERT INTO public.refund (order_id, kind, amount, reason, status, idempotency_key,
           actor_kind, actor_sub)
         VALUES ($1,'item',20,'item_not_supplied','submitted','k1','back_office','staff') RETURNING id`,
        [ORDER]);
      await pool.query(
        `INSERT INTO public.refund_line (refund_id, order_item_id, quantity, amount)
         VALUES ($1,$2,2,20)`, [rows[0]!.id, ITEM]);

      expect(await proposedRefunds(ORDER)).toHaveLength(0);
    });

    it("survives a PARTIAL refund - only the remainder is still a decision", async () => {
      await recordShortfall(3);
      const { rows } = await pool.query<{ id: string }>(
        `INSERT INTO public.refund (order_id, kind, amount, reason, status, idempotency_key,
           actor_kind, actor_sub)
         VALUES ($1,'item',10,'item_not_supplied','submitted','k2','back_office','staff') RETURNING id`,
        [ORDER]);
      await pool.query(
        `INSERT INTO public.refund_line (refund_id, order_item_id, quantity, amount)
         VALUES ($1,$2,1,10)`, [rows[0]!.id, ITEM]);

      const proposals = await proposedRefunds(ORDER);
      expect(proposals, "two of the three units are still owed").toHaveLength(1);
    });

    // A dismissal is the one fact the derivation cannot hold: a person looked and said no.
    it("is suppressed once a human dismisses it, and no money has moved", async () => {
      await recordShortfall(2);
      await pool.query(
        `INSERT INTO public.refund_proposal_dismissal
           (shop_fulfillment_id, order_item_id, dismissed_by, reason)
         VALUES ($1,$2,'staff-1','customer declined')`, [FULFILMENT, ITEM]);

      expect(await proposedRefunds(ORDER)).toHaveLength(0);
      const { rows } = await pool.query(`SELECT count(*)::int AS n FROM public.refund`);
      expect(rows[0]!.n, "a dismissal must never move money").toBe(0);
    });

    it("proposes nothing when the picker found everything", async () => {
      await recordShortfall(0);
      expect(await proposedRefunds(ORDER)).toHaveLength(0);
    });
  });

  describe("reading refunds on an order", () => {
    it("returns nothing for an order with no refunds", async () => {
      expect(await refunds(ORDER)).toHaveLength(0);
      expect(await refundRequest(ORDER)).toBeNull();
    });

    it("carries the provider's failure reason for staff", async () => {
      await pool.query(
        // The note is required by `refund_goodwill_needs_note_ck`.
        `INSERT INTO public.refund (order_id, kind, amount, reason, note, status, failure_reason,
           idempotency_key, actor_kind, actor_sub)
         VALUES ($1,'goodwill',5,'goodwill','late delivery','failed','expired_or_canceled_card',
                 'k3','back_office','staff')`,
        [ORDER]);

      const rows = await refunds(ORDER);
      expect(rows).toHaveLength(1);
      expect(rows[0]!.status).toBe("failed");
      // Staff-only; the customer sees "there was a problem".
      expect(rows[0]!.failure_reason).toBe("expired_or_canceled_card");
    });
  });

  /** Through `getOrder`, not the queries, so the composition must really be wired. */
  describe("the order read carries the refund picture (FR-020)", () => {
    async function issue(amount: string, status: string, units?: number) {
      // A failed or refused refund must carry the provider's reason.
      const failureReason = status === "failed" || status === "refused" ? "card_declined" : null;
      const { rows } = await pool.query<{ id: string }>(
        `INSERT INTO public.refund (order_id, kind, amount, reason, status, idempotency_key,
           actor_kind, actor_sub, failure_reason)
         VALUES ($1,'item',$2,'item_not_supplied',$3,'k-'||gen_random_uuid(),'back_office','s-1',$4)
         RETURNING id`, [ORDER, amount, status, failureReason]);
      if (units) {
        await pool.query(
          `INSERT INTO public.refund_line (refund_id, order_item_id, quantity, amount)
           VALUES ($1,$2,$3,$4)`, [rows[0]!.id, ITEM, units, amount]);
      }
      return rows[0]!.id;
    }

    it("reports nothing refunded and the whole total refundable on an untouched order", async () => {
      const o = await getOrder(ORDER);
      expect(o!.refundedAmount).toBe("0.00");
      expect(o!.refundableAmount).toBe("30.00");
      expect(o!.refunds).toEqual([]);
      expect(o!.refundableLines).toHaveLength(1);
      expect(o!.refundableLines[0]!.quantity, "all three units are still refundable").toBe(3);
    });

    it("subtracts a submitted refund from BOTH the money and the units", async () => {
      await issue("10.00", "submitted", 1);
      const o = await getOrder(ORDER);

      expect(o!.refundedAmount).toBe("10.00");
      expect(o!.refundableAmount).toBe("20.00");
      expect(o!.refundableLines[0]!.quantity, "one of three units is spent").toBe(2);
      expect(o!.refunds[0]!.lines[0]!.productName).toBe("Milk");
    });

    // Must match `COUNTED_REFUND_STATUSES`, or the console misstates the ceiling.
    it("counts `failed` against the ceiling but never `submitting` or `refused`", async () => {
      await issue("10.00", "failed", 1);
      await issue("5.00", "submitting");
      await issue("5.00", "refused");

      const o = await getOrder(ORDER);
      expect(o!.refundedAmount, "only the failed one counts").toBe("10.00");
      expect(o!.refundableAmount).toBe("20.00");
      expect(o!.refunds).toHaveLength(3);
    });

    it("omits a fully refunded line rather than offering zero units", async () => {
      await issue("30.00", "succeeded", 3);
      const o = await getOrder(ORDER);
      expect(o!.refundableLines, "a control that refuses when used is worse than no control")
        .toEqual([]);
      expect(o!.refundableAmount).toBe("0.00");
    });

    it("carries the derived proposals and the customer's open request", async () => {
      await recordShortfall(2);
      const { rows } = await pool.query<{ id: string }>(
        `INSERT INTO public.refund_request (order_id, customer_id, message, status)
         VALUES ($1,$2,'Two cartons were missing','open') RETURNING id`, [ORDER, CUST]);
      await pool.query(
        `INSERT INTO public.refund_request_item (request_id, order_item_id, quantity)
         VALUES ($1,$2,2)`, [rows[0]!.id, ITEM]);

      const o = await getOrder(ORDER);
      expect(o!.proposedRefunds).toHaveLength(1);
      expect(o!.proposedRefunds[0]!.amount).toBe("20.00");
      expect(o!.refundRequest!.message).toBe("Two cartons were missing");
      // The request's items must survive the second query hop.
      expect(o!.refundRequest!.items[0]!.productName).toBe("Milk");
    });
  });

  /** An unsuppliable portion is the most urgent item: the customer is out of pocket while it waits. */
  describe("a shop that cannot supply its portion (US6)", () => {
    async function markUnfulfillable() {
      await pool.query(
        `UPDATE public.shop_fulfillment
            SET status = 'unfulfillable', unfulfillable_reason = 'the chiller failed overnight'
          WHERE id = $1`,
        [FULFILMENT],
      );
    }

    it("puts the order in front of staff as awaiting a refund decision", async () => {
      const before = await getOrder(ORDER);
      expect(before!.awaiting).not.toBe("refund_decision");

      await markUnfulfillable();
      const after = await getOrder(ORDER);
      expect(after!.awaiting).toBe("refund_decision");
    });

    // It outranks the others: an order can wait on several things, and this says which comes first.
    it("outranks awaiting an arrival on the same order", async () => {
      await markUnfulfillable();
      const o = await getOrder(ORDER);
      expect(o!.awaiting).toBe("refund_decision");
    });

    // It moves no money; a person decides the refund.
    it("moves no money - it only asks for a decision", async () => {
      await markUnfulfillable();
      const o = await getOrder(ORDER);

      expect(o!.refunds).toEqual([]);
      expect(o!.refundedAmount).toBe("0.00");
      expect(o!.refundableAmount).toBe("30.00");
    });
  });
});