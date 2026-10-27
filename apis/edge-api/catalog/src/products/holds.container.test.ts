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

import { insertTestProduct, migrationSql, testLeafId } from "@effy/edge-shared/testing";

import { approve } from "../review/service";
import { hold, release } from "./holds";

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

d("102 — holding and releasing a product against real PostgreSQL", () => {
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
      `INSERT INTO public.shop_staff (cognito_sub, email, name, status, shop_id)
       VALUES ('op-1', 'op1@effyshopping.com', 'Op', 'active', $1), ('op-2', 'op2@effyshopping.com', 'Gone', 'disabled', $1)`,
      [shopId],
    );
  });

  it("holds an on-sale product: off sale, remembered, audited, the shop told, everyone re-reads", async () => {
    const id = await product();
    const dto = await hold(id, { version: await versionOf(id), reason: "  Recalled by the maker  " }, ADMIN);

    expect(await row(id)).toMatchObject({ status: "unavailable", held: true, held_reason: "Recalled by the maker", held_prior_status: "active" });
    expect(dto).toMatchObject({ state: "held", hold: { reason: "Recalled by the maker" } });
    const audit = (await pool.query(`SELECT actor_sub, action, detail FROM admin.audit_log WHERE target_id = $1`, [id])).rows;
    expect(audit).toEqual([{ actor_sub: ADMIN, action: "product.held", detail: { shopId, reason: "Recalled by the maker", priorStatus: "active" } }]);
    // Active operators only; the payload names the product and nothing else.
    const notes = (await pool.query(`SELECT recipient_sub, type, payload FROM public.notification_request`)).rows;
    expect(notes).toEqual([{ recipient_sub: "op-1", type: "shop_product_held", payload: { entityId: id } }]);
    expect(holder.announced).toEqual([{ scope: "ops", kind: "products" }, { scope: "shop", shopId, kind: "products" }]);
  });

  it("refuses without a reason, on a stale version, twice, or on an archived product", async () => {
    const id = await product();
    const v = await versionOf(id);
    expect(await errorOf(hold(id, { version: v, reason: " " }, ADMIN))).toBe("validation:say why this product is being held");
    expect(await errorOf(hold(id, { version: v, reason: "x".repeat(501) }, ADMIN))).toMatch(/^validation/);
    expect(await errorOf(hold(id, { version: "2000-01-01", reason: "r" }, ADMIN))).toBe("conflict:stale");
    await hold(id, { version: v, reason: "r" }, ADMIN);
    expect(await errorOf(hold(id, { version: await versionOf(id), reason: "r" }, ADMIN))).toBe("conflict:already_held");
    const archived = await product({ status: "archived" });
    expect(await errorOf(hold(archived, { version: await versionOf(archived), reason: "r" }, ADMIN))).toBe("conflict:archived");
  });

  it("a held product can never be made active, whichever route writes it (SC-004)", async () => {
    const id = await product();
    await hold(id, { version: await versionOf(id), reason: "r" }, ADMIN);
    await expect(pool.query(`UPDATE public.product SET status = 'active' WHERE id = $1`, [id])).rejects.toThrow(/product_held_not_active_ck/);
    await expect(pool.query(`UPDATE public.product SET status = 'archived' WHERE id = $1`, [id])).rejects.toThrow(/product_held_not_archived_ck/);
  });

  it("releases to the status the hold found", async () => {
    for (const status of ["active", "unavailable", "draft"] as const) {
      const id = await product({ status });
      await hold(id, { version: await versionOf(id), reason: "r" }, ADMIN);
      const r = await release(id, { version: await versionOf(id) }, ADMIN);
      expect(r).toMatchObject({ releasedTo: status, notOnSaleBecause: null });
      expect(await row(id)).toMatchObject({ status, held: false, held_reason: null, held_prior_status: null });
    }
    expect(await errorOf(release(await product(), { version: "x" }, ADMIN))).toBe("conflict:stale");
    const free = await product();
    expect(await errorOf(release(free, { version: await versionOf(free) }, ADMIN))).toBe("conflict:not_held");
  });

  it("does not put a product on sale with no main picture, or for a shop that is not active", async () => {
    const id = await product();
    await hold(id, { version: await versionOf(id), reason: "r" }, ADMIN);
    await pool.query(`DELETE FROM public.product_media WHERE product_id = $1`, [id]);
    expect(await release(id, { version: await versionOf(id) }, ADMIN)).toMatchObject({ releasedTo: "unavailable", notOnSaleBecause: "no_main_picture" });

    const other = await product();
    await hold(other, { version: await versionOf(other), reason: "r" }, ADMIN);
    await pool.query(`UPDATE public.shop SET status = 'suspended' WHERE id = $1`, [shopId]);
    expect(await release(other, { version: await versionOf(other) }, ADMIN)).toMatchObject({ releasedTo: "unavailable", notOnSaleBecause: "shop_not_active" });
  });

  it("approving a held product in review leaves it off sale; releasing puts it on sale", async () => {
    const id = await product({ status: "draft" });
    await pool.query(`UPDATE public.product SET review_state = 'in_review', submitted_at = now() WHERE id = $1`, [id]);
    await hold(id, { version: await versionOf(id), reason: "check the label" }, ADMIN);

    await approve(id, { version: await versionOf(id), margin: { kind: "percent", value: "10" } }, ADMIN);
    expect(await row(id)).toMatchObject({ status: "draft", held: true, held_prior_status: "active" });

    expect(await release(id, { version: await versionOf(id) }, ADMIN)).toMatchObject({ releasedTo: "active" });
    expect(await row(id)).toMatchObject({ status: "active", held: false });
  });
});
