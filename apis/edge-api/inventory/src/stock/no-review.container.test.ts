import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 067 FR-023 — STOCK IS NEVER REVIEWED, against the real migrations.
 *
 * The client's own words: every change to a product's details needs Effy's approval, "except stock
 * quantity". A shop receiving a delivery at 6 am cannot wait for someone at Effy to approve the
 * number on its shelf.
 *
 * ⚠ THIS IS NOT THE GUARD. `stock-no-review.guard.test.ts` reads this service's source and fails if
 * it names the review tables. This runs the four stock writes against a product that HAS a change
 * pending and proves what the guard can only imply: the count moves at once, no change is created,
 * and the one that is waiting is left exactly as the shop wrote it.
 */

const holder = vi.hoisted(() => ({ pool: null as Pool | null }));

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
  };
});

import { migrationSql } from "@effy/edge-shared";

import { adjustCount, setCount, setThreshold, setTracking } from "./service";
import type { Actor } from "./types";

const RUN = process.env.CONTAINER_TESTS === "1";
const d = RUN ? describe : describe.skip;

let container: StartedPostgreSqlContainer;
let pool: Pool;
let actor: Actor;
let productId: string;

/** Everything about the product that a customer sees, and the change waiting on Effy. */
async function snapshot() {
  const live = (await pool.query(
    `SELECT name, price_amount, shop_price_amount, status, approved_at, review_state, updated_at::text AS v
       FROM public.product WHERE id = $1`, [productId],
  )).rows[0];
  const change = (await pool.query(
    `SELECT proposed, media_changed, state, reason, submitted_at::text AS s, updated_at::text AS v
       FROM public.product_change WHERE product_id = $1`, [productId],
  )).rows;
  return { live, change };
}

const stock = async () =>
  (await pool.query(
    `SELECT stock_tracked, stock_on_hand, low_stock_threshold FROM public.product WHERE id = $1`, [productId],
  )).rows[0];

d("067 — stock is never reviewed (real PostgreSQL)", () => {
  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:16-alpine").start();
    pool = new Pool({ connectionString: container.getConnectionUri() });
    holder.pool = pool;
    await pool.query(migrationSql());
  }, 300_000);

  afterAll(async () => {
    await pool?.end();
    await container?.stop();
  });

  beforeEach(async () => {
    await pool.query("DELETE FROM public.product_change");
    await pool.query("DELETE FROM public.stock_movement");
    await pool.query("DELETE FROM public.product");
    await pool.query("DELETE FROM public.shop");
    const shopId = (await pool.query<{ id: string }>(
      `INSERT INTO public.shop (code, name) VALUES ('ST', 'Stock shop') RETURNING id`,
    )).rows[0]!.id;
    actor = { sub: "sub-shop", shopId, kind: "shop" };
    // An APPROVED product, on sale, with a change to its name and price waiting on Effy.
    productId = (await pool.query<{ id: string }>(
      `INSERT INTO public.product (shop_id, product_type_id, primary_category_id, name, price_amount,
                                   shop_price_amount, short_description, created_by, status, approved_at)
       SELECT $1, (SELECT id FROM public.product_type LIMIT 1), (SELECT id FROM public.category LIMIT 1),
              'Sourdough', 11.50, 10.00, 'A loaf', 'seed', 'active', now()
       RETURNING id`, [shopId],
    )).rows[0]!.id;
    await pool.query(
      `INSERT INTO public.product_change (product_id, shop_id, proposed)
       VALUES ($1, $2, '{"name":"Rye","priceAmount":"12.00"}'::jsonb)`, [productId, shopId],
    );
  });

  it("⚠ every stock write applies at once and leaves the pending change byte-identical", async () => {
    const before = await snapshot();
    expect(before.change).toHaveLength(1);

    await setTracking(actor, productId, { tracked: true, onHand: 12 });
    expect(await stock()).toMatchObject({ stock_tracked: true, stock_on_hand: 12 });

    await adjustCount(actor, productId, { delta: 24, reason: "received" });
    expect((await stock()).stock_on_hand).toBe(36);

    await setCount(actor, productId, { onHand: 30, reason: "correction" });
    expect((await stock()).stock_on_hand).toBe(30);

    await setThreshold(actor, productId, { threshold: 5 });
    expect((await stock()).low_stock_threshold).toBe(5);

    await setTracking(actor, productId, { tracked: false });
    expect((await stock()).stock_tracked).toBe(false);

    const after = await snapshot();
    // The change waiting on Effy is exactly what the shop wrote — same proposal, same version.
    expect(after.change).toEqual(before.change);
    // What customers see did not move, and neither did where the product stands with review.
    expect(after.live.name).toBe("Sourdough");
    expect(after.live.price_amount).toBe(before.live.price_amount);
    expect(after.live.status).toBe("active");
    expect(after.live.review_state).toBe(before.live.review_state);
    expect(after.live.approved_at).toEqual(before.live.approved_at);
  });

  it("a stock write on a product with nothing pending creates no change", async () => {
    await pool.query("DELETE FROM public.product_change");
    await setTracking(actor, productId, { tracked: true, onHand: 3 });
    await adjustCount(actor, productId, { delta: -1, reason: "damage" });
    expect((await pool.query(`SELECT count(*) AS n FROM public.product_change`)).rows[0].n).toBe("0");
  });

  // A product Effy has not approved yet still has a shelf. Counting it must not wait on review,
  // and must not quietly submit or un-submit it.
  it("stock can be set on a product still in review, without moving its review state", async () => {
    await pool.query("DELETE FROM public.product_change");
    await pool.query(
      `UPDATE public.product
          SET status = 'draft', approved_at = NULL, review_state = 'in_review', submitted_at = now()
        WHERE id = $1`, [productId],
    );
    await setTracking(actor, productId, { tracked: true, onHand: 8 });
    const row = (await pool.query(
      `SELECT status, review_state, stock_on_hand FROM public.product WHERE id = $1`, [productId],
    )).rows[0];
    expect(row).toEqual({ status: "draft", review_state: "in_review", stock_on_hand: 8 });
  });
});
