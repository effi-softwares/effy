import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const holder = vi.hoisted(() => ({ pool: null as Pool | null, announced: [] as unknown[] }));

vi.mock("@effy/edge-shared", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("@effy/edge-shared");
  const q = (text: string, params?: unknown[]) => holder.pool!.query(text, params as never[]);
  return {
    ...actual,
    presignRead: async (key: string) => `signed:${key}`,
    publicImageUrl: (key: string | null) => (key ? `cdn:${key}` : null),
    emitMetric: () => undefined,
    query: q,
    pooled: { query: q },
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

vi.mock("@effy/edge-shared/live", () => ({
  announce: async (changes: unknown[]) => {
    holder.announced.push(...changes);
  },
}));

import { insertTestOption, insertTestProduct, migrationSql, testLeafId } from "@effy/edge-shared/testing";

import { bulk, setVariantState } from "./controls";
import { hold } from "./holds";

const RUN = process.env.CONTAINER_TESTS === "1";
const d = RUN ? describe : describe.skip;

const ADMIN = "staff-admin";

let container: StartedPostgreSqlContainer;
let pool: Pool;
let shopId: string;
let leaf: string;

const versionOf = async (id: string) =>
  (await pool.query<{ v: string }>(`SELECT updated_at::text AS v FROM public.product WHERE id = $1`, [id])).rows[0]!.v;

const row = async (id: string) =>
  (await pool.query(
    `SELECT status, held_at IS NOT NULL AS held, held_reason, held_prior_status FROM public.product WHERE id = $1`, [id],
  )).rows[0];

const errorOf = async (p: Promise<unknown>): Promise<string> => {
  try {
    await p;
    return "no-throw";
  } catch (e) {
    const err = e as { kind?: string; message: string };
    return `${err.kind}:${err.message.split(":")[0]}`;
  }
};

async function product(o: { status?: "draft" | "active" | "unavailable" | "archived"; picture?: boolean } = {}) {
  const { productId } = await insertTestProduct(pool, { shopId, primaryCategoryId: leaf, name: "Milk", price: "2.00", status: o.status ?? "active" });
  if (o.picture ?? true) {
    await pool.query(`INSERT INTO public.product_media (product_id, storage_key, is_primary) VALUES ($1, 'products/m.jpg', true)`, [productId]);
  }
  return productId;
}

/** A second variant on a product: an option with two values, the existing variant on the first. */
async function twoSizes(productId: string): Promise<{ small: string; large: string }> {
  const [a, b] = await insertTestOption(pool, productId, ["500 g", "1 kg"]);
  const small = (await pool.query<{ id: string }>(
    `UPDATE public.product_variant SET option1_value_id = $2 WHERE product_id = $1 RETURNING id::text`, [productId, a],
  )).rows[0]!.id;
  const large = (await pool.query<{ id: string }>(
    `INSERT INTO public.product_variant (product_id, shop_id, option1_value_id, position, shop_price_amount, price_amount)
     SELECT id, shop_id, $2, 1, 4.00, 4.00 FROM public.product WHERE id = $1 RETURNING id::text`, [productId, b],
  )).rows[0]!.id;
  return { small, large };
}

const states = async (id: string) =>
  (await pool.query(`SELECT state FROM public.product_variant WHERE product_id = $1 ORDER BY position`, [id])).rows.map((r) => r.state);

d("102 — Effy's other controls against real PostgreSQL", () => {
  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:16-alpine").start();
    pool = new Pool({ connectionString: container.getConnectionUri() });
    holder.pool = pool;
    await pool.query(migrationSql());
    leaf = await testLeafId(pool);
  }, 300_000);

  afterAll(async () => {
    await pool?.end();
    await container?.stop();
  });

  beforeEach(async () => {
    holder.announced = [];
    await pool.query("DELETE FROM public.notification_request");
    await pool.query("DELETE FROM admin.audit_log");
    await pool.query("DELETE FROM public.product");
    await pool.query("DELETE FROM public.shop_staff");
    await pool.query("DELETE FROM public.shop");
    shopId = (await pool.query<{ id: string }>(`INSERT INTO public.shop (code, name) VALUES ('HLD', 'Hold shop') RETURNING id::text`)).rows[0]!.id;
    await pool.query(
      `INSERT INTO public.shop_staff (cognito_sub, email, name, status, shop_id) VALUES ('op-1', 'op1@effyshopping.com', 'Op', 'active', $1)`,
      [shopId],
    );
  });

  it("puts one size off sale and back, audited; never on while held, never the last one off", async () => {
    const id = await product();
    const { small, large } = await twoSizes(id);

    await setVariantState(id, small, { version: await versionOf(id), state: "inactive" }, ADMIN);
    expect(await states(id)).toEqual(["inactive", "active"]);
    expect(await errorOf(setVariantState(id, large, { version: await versionOf(id), state: "inactive" }, ADMIN))).toBe("conflict:last_variant");

    await hold(id, { version: await versionOf(id), reason: "r" }, ADMIN);
    expect(await errorOf(setVariantState(id, small, { version: await versionOf(id), state: "active" }, ADMIN))).toBe("conflict:product_held");
    expect(await errorOf(setVariantState(id, small, { version: "stale", state: "active" }, ADMIN))).toBe("conflict:stale");

    const audit = (await pool.query(`SELECT action, detail FROM admin.audit_log WHERE target_id = $1 ORDER BY created_at`, [id])).rows;
    expect(audit[0]).toEqual({ action: "product.variant_state_set", detail: { shopId, variantId: small, to: "inactive" } });
  });

  it("bulk margin re-prices every product it can and lists the rest with a reason", async () => {
    const ok = await Promise.all([product(), product(), product()]);
    const draft = await product({ status: "draft" });
    await pool.query(`UPDATE public.product SET approved_at = NULL WHERE id = $1`, [draft]);
    const stale = await product();
    const items = [
      ...(await Promise.all(ok.map(async (productId) => ({ productId, version: await versionOf(productId) })))),
      { productId: draft, version: await versionOf(draft) },
      { productId: stale, version: "2000-01-01 00:00:00+00" },
    ];

    const r = await bulk({ action: "margin", items, margin: { kind: "percent", value: "20" } }, ADMIN);
    expect(r.done.sort()).toEqual([...ok].sort());
    expect(r.refused.map((x) => x.productId).sort()).toEqual([draft, stale].sort());
    const prices = (await pool.query(
      `SELECT DISTINCT price_amount::text AS p FROM public.product_variant WHERE product_id = ANY($1::uuid[])`, [ok],
    )).rows;
    expect(prices).toEqual([{ p: "2.40" }]);
    expect((await pool.query(`SELECT count(*)::int AS n FROM admin.audit_log WHERE action = 'product.margin_set'`)).rows[0]).toEqual({ n: 3 });
    // The margin is Effy's figure: no shop is told.
    expect((await pool.query(`SELECT count(*)::int AS n FROM public.notification_request`)).rows[0]).toEqual({ n: 0 });
  });

  it("bulk hold tells each shop once per product, refuses what it cannot, and bulk release undoes it", async () => {
    const otherShop = (await pool.query<{ id: string }>(`INSERT INTO public.shop (code, name) VALUES ('OTH', 'Other') RETURNING id::text`)).rows[0]!.id;
    await pool.query(
      `INSERT INTO public.shop_staff (cognito_sub, email, name, status, shop_id) VALUES ('op-9', 'op9@effyshopping.com', 'Op', 'active', $1)`,
      [otherShop],
    );
    const a = await product();
    const b = (await insertTestProduct(pool, { shopId: otherShop, primaryCategoryId: leaf, name: "Bread", price: "3.00" })).productId;
    const archived = await product({ status: "archived" });
    const items = await Promise.all([a, b, archived].map(async (productId) => ({ productId, version: await versionOf(productId) })));

    const r = await bulk({ action: "hold", items, reason: "Supplier recall" }, ADMIN);
    expect(r.done.sort()).toEqual([a, b].sort());
    expect(r.refused).toEqual([{ productId: archived, reason: "an archived product cannot be held" }]);
    const notes = (await pool.query(`SELECT recipient_sub, type FROM public.notification_request ORDER BY recipient_sub`)).rows;
    expect(notes).toEqual([{ recipient_sub: "op-1", type: "shop_product_held" }, { recipient_sub: "op-9", type: "shop_product_held" }]);
    expect(holder.announced).toEqual(
      expect.arrayContaining([{ scope: "ops", kind: "products" }, { scope: "shop", shopId, kind: "products" }, { scope: "shop", shopId: otherShop, kind: "products" }]),
    );

    const back = await bulk({ action: "release", items: await Promise.all([a, b].map(async (productId) => ({ productId, version: await versionOf(productId) }))) }, ADMIN);
    expect(back.done.sort()).toEqual([a, b].sort());
    expect((await row(a)).status).toBe("active");
  });

  it("refuses an empty, oversized or unexplained bulk action outright", async () => {
    expect(await errorOf(bulk({ action: "hold", items: [] }, ADMIN))).toMatch(/^validation/);
    expect(await errorOf(bulk({ action: "dance", items: [{ productId: "x", version: "v" }] }, ADMIN))).toMatch(/^validation/);
    const many = Array.from({ length: 201 }, () => ({ productId: "00000000-0000-4000-8000-000000000000", version: "v" }));
    expect(await errorOf(bulk({ action: "release", items: many }, ADMIN))).toMatch(/^validation/);
    expect(await errorOf(bulk({ action: "hold", items: [{ productId: "00000000-0000-4000-8000-000000000000", version: "v" }] }, ADMIN))).toMatch(/^validation/);
  });
});
