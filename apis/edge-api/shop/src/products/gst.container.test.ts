import { randomUUID } from "node:crypto";

import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

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
vi.mock("./media", () => ({
  presignRead: async (key: string) => `signed:${key}`,
  presignUpload: async () => ({ uploadUrl: "u", storageKey: "k" }),
}));

import { migrationSql } from "@effy/edge-shared/testing";

import { createProduct, getProduct, updateProduct } from "./service";

const d = process.env.CONTAINER_TESTS === "1" ? describe : describe.skip;
let container: StartedPostgreSqlContainer;
let pool: Pool;

d("096 US9 — a product's GST status, set by the shop", () => {
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

  it("is set at create, changed directly on a draft, and PROPOSED on a live product — each with its history", async () => {
    const shopId = (await pool.query<{ id: string }>(`INSERT INTO public.shop (code, name) VALUES ('GSH', 'Shop') RETURNING id`)).rows[0]!.id;
    const staff = (await pool.query<{ id: string }>(
      `INSERT INTO public.shop_staff (shop_id, cognito_sub, email) VALUES ($1, 'sub-sam', 'sam@effyshopping.com') RETURNING id`, [shopId])).rows[0]!.id;
    const leaf = (await pool.query<{ c: string }>(`SELECT id::text AS c FROM public.category WHERE key = 'full-cream-milk'`)).rows[0]!.c;

    const created = await createProduct(shopId, {
      primaryCategoryId: leaf, name: "Milk", shortDescription: "Full cream", options: [],
      variants: [{ id: randomUUID(), position: 0, optionValueIds: [null, null], sku: null, gtin: null, shopPriceAmount: "4.50", shopCompareAtAmount: null, weightGrams: null, packQuantity: null, packUnit: null, mediaStorageKey: null }],
      unitBasis: null, gstStatus: "gst_free",
    }, "sub-sam");
    expect(created.gstStatus).toBe("gst_free");

    // A draft is edited directly.
    await updateProduct(shopId, created.id, { expectedUpdatedAt: created.updatedAt, gstStatus: "taxable" }, "sub-sam");
    expect((await getProduct(shopId, created.id)).gstStatus).toBe("taxable");
    // A bad value is refused, naming the field.
    const fresh = await getProduct(shopId, created.id);
    await expect(updateProduct(shopId, created.id, { expectedUpdatedAt: fresh.updatedAt, gstStatus: "zero" }, "sub-sam"))
      .rejects.toMatchObject({ kind: "validation" });

    // Live: the change is proposed; the live status waits for review.
    await pool.query(`UPDATE public.product SET approved_at = now(), status = 'active' WHERE id = $1`, [created.id]);
    await updateProduct(shopId, created.id, { gstStatus: "gst_free" }, "sub-sam");
    const live = await getProduct(shopId, created.id);
    expect(live.pendingChange?.proposed.gstStatus).toBe("gst_free");
    expect((await pool.query(`SELECT gst_status FROM public.product WHERE id = $1`, [created.id])).rows[0].gst_status).toBe("taxable");

    const history = await pool.query(
      `SELECT from_status, to_status, actor_kind, shop_staff_id, via FROM public.product_gst_change WHERE product_id = $1 ORDER BY changed_at, id`,
      [created.id]);
    expect(history.rows).toEqual([
      { from_status: null, to_status: "gst_free", actor_kind: "shop_staff", shop_staff_id: staff, via: "create" },
      { from_status: "gst_free", to_status: "taxable", actor_kind: "shop_staff", shop_staff_id: staff, via: "direct" },
    ]);

    // 101: created without one, it takes its leaf's default (Dairy → GST-free).
    const defaulted = await createProduct(shopId, {
      primaryCategoryId: leaf, name: "Cream", shortDescription: "Pouring", options: [],
      variants: [{ id: randomUUID(), position: 0, optionValueIds: [null, null], shopPriceAmount: "3.00" }],
    }, "sub-sam");
    expect(defaulted).toMatchObject({ gstStatus: "gst_free", storage: "chilled", ageRestricted: false });
  });
});
