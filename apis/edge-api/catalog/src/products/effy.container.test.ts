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

import { randomUUID } from "node:crypto";

import { migrationSql } from "@effy/edge-shared/testing";

import { queue as queueReq } from "../review/service";
import { parseListQuery } from "@effy/edge-shared";
import { REVIEW_QUEUE_SPEC } from "../review/list";

/** The queue as its route parses it (103). */
const queue = (qs: Record<string, string>) => queueReq(parseListQuery(qs, REVIEW_QUEUE_SPEC));
import { createForShop, editEffyOwned } from "./effy";
import { hold } from "./holds";

const RUN = process.env.CONTAINER_TESTS === "1";
const d = RUN ? describe : describe.skip;

const ADMIN = "staff-admin";

let container: StartedPostgreSqlContainer;
let pool: Pool;
let shopId: string;

const errorOf = async (p: Promise<unknown>): Promise<string> => {
  try {
    await p;
    return "no-throw";
  } catch (e) {
    const err = e as { kind?: string; message: string };
    return `${err.kind}:${err.message.split(":")[0]}`;
  }
};

let plainLeaf: string;
let requiredLeaf: string;

/** The form as Effy's screen sends it: one size, every fact chosen. */
function form(o: { leaf?: string; name?: string; media?: string[]; sku?: string } = {}) {
  return {
    primaryCategoryId: o.leaf ?? plainLeaf,
    name: o.name ?? "Sourdough loaf",
    shortDescription: "Baked this morning",
    storage: "ambient",
    gstStatus: "gst_free",
    ageRestricted: false,
    unitBasis: null,
    options: [],
    variants: [{
      id: randomUUID(), position: 0, optionValueIds: [null, null], sku: o.sku ?? `SKU-${randomUUID().slice(0, 6)}`, gtin: null,
      shopPriceAmount: "10.00", shopCompareAtAmount: null, weightGrams: 800, packQuantity: null, packUnit: null, mediaStorageKey: null,
    }],
    details: [],
    media: (o.media ?? []).map((storageKey, i) => ({ storageKey, isPrimary: i === 0, displayOrder: i })),
  };
}

const MARGIN = { kind: "percent", value: "10" };

d("102 — Effy creates and finishes a product for a shop against real PostgreSQL", () => {
  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:16-alpine").start();
    pool = new Pool({ connectionString: container.getConnectionUri() });
    holder.pool = pool;
    await pool.query(migrationSql());
    plainLeaf = (await pool.query<{ id: string }>(
      `SELECT r.category_id::text AS id FROM public.category_resolved r
        WHERE r.is_leaf AND NOT EXISTS (SELECT 1 FROM public.category_form f WHERE f.category_id = r.category_id AND f.level = 'required')
        ORDER BY r.category_id LIMIT 1`,
    )).rows[0]!.id;
    requiredLeaf = (await pool.query<{ id: string }>(
      `SELECT r.category_id::text AS id FROM public.category_resolved r
        WHERE r.is_leaf AND EXISTS (SELECT 1 FROM public.category_form f WHERE f.category_id = r.category_id AND f.level = 'required')
        ORDER BY r.category_id LIMIT 1`,
    )).rows[0]!.id;
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
    shopId = (await pool.query<{ id: string }>(`INSERT INTO public.shop (code, name) VALUES ('EFY', 'Bakery') RETURNING id::text`)).rows[0]!.id;
    await pool.query(
      `INSERT INTO public.shop_staff (cognito_sub, email, name, status, shop_id) VALUES ('op-1', 'op1@effyshopping.com', 'Op', 'active', $1)`,
      [shopId],
    );
  });

  it("refuses without a shop or margin, for a shop that is not active, or in a category with sub-categories", async () => {
    expect(await errorOf(createForShop({ ...form(), margin: MARGIN }, ADMIN))).toBe("validation:choose a shop");
    expect(await errorOf(createForShop({ ...form(), shopId }, ADMIN))).toMatch(/^validation/);
    const parent = (await pool.query<{ id: string }>(`SELECT category_id::text AS id FROM public.category_resolved WHERE NOT is_leaf LIMIT 1`)).rows[0]!.id;
    expect(await errorOf(createForShop({ ...form({ leaf: parent }), shopId, margin: MARGIN }, ADMIN))).toMatch(/^validation/);
    await pool.query(`UPDATE public.shop SET status = 'suspended' WHERE id = $1`, [shopId]);
    expect(await errorOf(createForShop({ ...form(), shopId, margin: MARGIN }, ADMIN))).toBe("conflict:shop_not_active");
  });

  it("creates it as Effy's draft, never in the review queue; a main picture completes it and puts it on sale", async () => {
    const created = await createForShop({ ...form(), shopId, margin: MARGIN }, ADMIN);
    expect(created).toMatchObject({ state: "draft", origin: "effy", effySettingUp: true, margin: { kind: "percent", value: "10" } });
    expect((await queue({})).items).toEqual([]);
    expect((await pool.query(`SELECT count(*)::int AS n FROM public.notification_request`)).rows[0]).toEqual({ n: 0 });

    const id = created.productId;
    const done = await editEffyOwned(id, { ...form({ media: [`products/${id}/main.jpg`] }), version: created.version }, ADMIN);
    expect(done).toMatchObject({ state: "on_sale", effySettingUp: false });
    expect(done.variants[0]).toMatchObject({ shopPriceAmount: "10.00", customerPriceAmount: "11.00" });

    const actions = (await pool.query(`SELECT action FROM admin.audit_log WHERE target_id = $1 ORDER BY created_at`, [id])).rows.map((r) => r.action);
    expect(actions).toEqual(["product.created_by_effy", "product.effy_edited", "product.effy_completed"]);
    expect((await pool.query(`SELECT recipient_sub, type FROM public.notification_request`)).rows).toEqual([
      { recipient_sub: "op-1", type: "shop_product_added_by_effy" },
    ]);
    expect(holder.announced).toContainEqual({ scope: "shop", shopId, kind: "products" });

    // From now on it is the shop's.
    expect(await errorOf(editEffyOwned(id, { ...form(), version: done.version }, ADMIN))).toBe("conflict:not_effy_owned");
  });

  it("stays a draft while a required detail is missing, and refuses pictures that are not this product's", async () => {
    const created = await createForShop({ ...form({ leaf: requiredLeaf }), shopId, margin: MARGIN }, ADMIN);
    const id = created.productId;
    const after = await editEffyOwned(id, { ...form({ leaf: requiredLeaf, media: [`products/${id}/a.jpg`] }), version: created.version }, ADMIN);
    expect(after).toMatchObject({ state: "draft", effySettingUp: true });
    expect(after.missingRequired.length).toBeGreaterThan(0);

    expect(await errorOf(editEffyOwned(id, { ...form({ media: ["products/someone-else/x.jpg"] }), version: after.version }, ADMIN))).toBe(
      "validation:a picture does not belong to this product",
    );
    expect(await errorOf(editEffyOwned(id, { ...form(), version: "stale" }, ADMIN))).toBe("conflict:stale");
  });

  it("a held product Effy finishes is approved but stays off sale until released", async () => {
    const created = await createForShop({ ...form(), shopId, margin: MARGIN }, ADMIN);
    const id = created.productId;
    const held = await hold(id, { version: created.version, reason: "Waiting for the label" }, ADMIN);
    const done = await editEffyOwned(id, { ...form({ media: [`products/${id}/m.jpg`] }), version: held.version }, ADMIN);
    expect(done).toMatchObject({ state: "held", effySettingUp: false });
    expect((await pool.query(`SELECT status, held_prior_status FROM public.product WHERE id = $1`, [id])).rows[0]).toEqual({
      status: "draft", held_prior_status: "active",
    });
  });

  it("a duplicate size code in the shop is the form's error, not a crash", async () => {
    await createForShop({ ...form({ sku: "DUP-1" }), shopId, margin: MARGIN }, ADMIN);
    expect(await errorOf(createForShop({ ...form({ sku: "dup-1", name: "Another" }), shopId, margin: MARGIN }, ADMIN))).toMatch(/^validation/);
  });
});
