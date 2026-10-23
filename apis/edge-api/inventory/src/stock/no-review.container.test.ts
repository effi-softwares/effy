import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Stock is never reviewed: the four stock writes on a product with a pending change move the count
 * at once, create no change, and leave the pending one untouched.
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

import { migrationSql } from "@effy/edge-shared/testing";

import { adjustCount, setCount, setThreshold, setTracking } from "./service";
import type { Actor } from "./types";

const RUN = process.env.CONTAINER_TESTS === "1";
const d = RUN ? describe : describe.skip;

let container: StartedPostgreSqlContainer;
let pool: Pool;
let actor: Actor;
let productId: string;
let variantId: string;

async function snapshot() {
  const live = (await pool.query(
    `SELECT p.name, v.price_amount, v.shop_price_amount, p.status, p.approved_at, p.review_state, p.updated_at::text AS v
       FROM public.product p JOIN public.product_variant v ON v.product_id = p.id WHERE p.id = $1`, [productId],
  )).rows[0];
  const change = (await pool.query(
    `SELECT proposed, media_changed, state, reason, submitted_at::text AS s, updated_at::text AS v
       FROM public.product_change WHERE product_id = $1`, [productId],
  )).rows;
  return { live, change };
}

const stock = async () =>
  (await pool.query(
    `SELECT stock_tracked, stock_on_hand, low_stock_threshold FROM public.product_variant WHERE product_id = $1`, [productId],
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
    // An approved product, on sale, with a change to its name and price waiting on Effy.
    productId = (await pool.query<{ id: string }>(
      `WITH p AS (INSERT INTO public.product (shop_id, product_type_id, primary_category_id, name, short_description, created_by, status, approved_at) VALUES ($1, (SELECT id FROM public.product_type LIMIT 1), (SELECT id FROM public.category LIMIT 1), 'Sourdough', 'A loaf', 'seed', 'active', now()) RETURNING *),
     pv AS (INSERT INTO public.product_variant (product_id, shop_id, shop_price_amount, price_amount) SELECT p.id, p.shop_id, COALESCE(10.00, 11.50)::numeric, (11.50)::numeric FROM p RETURNING id)
SELECT id FROM p`, [shopId],
    )).rows[0]!.id;
    variantId = (await pool.query<{ id: string }>(`SELECT id::text FROM public.product_variant WHERE product_id = $1`, [productId])).rows[0]!.id;
    await pool.query(
      `INSERT INTO public.product_change (product_id, shop_id, proposed)
       VALUES ($1, $2, '{"name":"Rye","priceAmount":"12.00"}'::jsonb)`, [productId, shopId],
    );
  });

  it("⚠ every stock write applies at once and leaves the pending change byte-identical", async () => {
    const before = await snapshot();
    expect(before.change).toHaveLength(1);

    await setTracking(actor, variantId, { tracked: true, onHand: 12 });
    expect(await stock()).toMatchObject({ stock_tracked: true, stock_on_hand: 12 });

    await adjustCount(actor, variantId, { delta: 24, reason: "received" });
    expect((await stock()).stock_on_hand).toBe(36);

    await setCount(actor, variantId, { onHand: 30, reason: "correction" });
    expect((await stock()).stock_on_hand).toBe(30);

    await setThreshold(actor, variantId, { threshold: 5 });
    expect((await stock()).low_stock_threshold).toBe(5);

    await setTracking(actor, variantId, { tracked: false });
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
    await setTracking(actor, variantId, { tracked: true, onHand: 3 });
    await adjustCount(actor, variantId, { delta: -1, reason: "damage" });
    expect((await pool.query(`SELECT count(*) AS n FROM public.product_change`)).rows[0].n).toBe("0");
  });

  // A product not yet approved still has a shelf; counting must not submit or un-submit it.
  it("stock can be set on a product still in review, without moving its review state", async () => {
    await pool.query("DELETE FROM public.product_change");
    await pool.query(
      `UPDATE public.product
          SET status = 'draft', approved_at = NULL, review_state = 'in_review', submitted_at = now()
        WHERE id = $1`, [productId],
    );
    await setTracking(actor, variantId, { tracked: true, onHand: 8 });
    const row = (await pool.query(
      `SELECT p.status, p.review_state, v.stock_on_hand FROM public.product p JOIN public.product_variant v ON v.product_id = p.id WHERE p.id = $1`, [productId],
    )).rows[0];
    expect(row).toEqual({ status: "draft", review_state: "in_review", stock_on_hand: 8 });
  });
});
