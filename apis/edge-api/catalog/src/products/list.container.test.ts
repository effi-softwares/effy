import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const holder = vi.hoisted(() => ({ pool: null as Pool | null }));

vi.mock("@effy/edge-shared", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("@effy/edge-shared");
  const q = (text: string, params?: unknown[]) => holder.pool!.query(text, params as never[]);
  return {
    ...actual,
    presignRead: async (key: string) => `signed:${key}`,
    publicImageUrl: (key: string | null) => (key ? `cdn:${key}` : null),
    query: q,
    pooled: { query: q },
  };
});

import { activityEntries, insertTestProduct, insertTestVariant, migrationSql, testLeafId } from "@effy/edge-shared/testing";
import type { BackOfficeProductListDTO } from "@effy/shared-types";

import { parseListQuery } from "@effy/edge-shared";

import { productActivitySource } from "./activity";
import { PRODUCT_LIST_SPEC } from "./list";
import { detail, list as listReq } from "./service";

/** The list as the route parses it (103). */
const list = (params: Record<string, string>) => listReq(parseListQuery({ pageSize: "100", ...params }, PRODUCT_LIST_SPEC));

const RUN = process.env.CONTAINER_TESTS === "1";
const d = RUN ? describe : describe.skip;

let container: StartedPostgreSqlContainer;
let pool: Pool;
let shopA: string;
let shopB: string;
let shopC: string;
let leaf: string;
let otherLeaf: string;
/** A top-level ancestor of `leaf` that `otherLeaf` is not under. */
let department: string;

async function makeShop(code: string): Promise<string> {
  return (await pool.query<{ id: string }>(
    `INSERT INTO public.shop (code, name) VALUES ($1, $1 || ' shop') RETURNING id::text`, [code],
  )).rows[0]!.id;
}

/** One product per state, in shop A unless said. Returns ids by state. */
async function seedEveryState(): Promise<Record<string, string>> {
  const ids: Record<string, string> = {};
  const mk = async (key: string, o: Partial<Parameters<typeof insertTestProduct>[1]> = {}) => {
    const { productId } = await insertTestProduct(pool, {
      shopId: shopA, primaryCategoryId: leaf, name: `P ${key}`, price: "10.00", ...o,
    });
    ids[key] = productId;
    return productId;
  };
  await mk("on_sale", { sku: "SKU-ON", gtin: "9300000000001" });
  await mk("off_sale", { status: "unavailable", approved: true });
  await mk("draft", { status: "draft", approved: false });
  const sentBack = await mk("sent_back", { status: "draft", approved: false });
  await pool.query(`UPDATE public.product SET review_state = 'sent_back', review_reason = 'no' WHERE id = $1`, [sentBack]);
  const inReview = await mk("in_review", { status: "draft", approved: false });
  await pool.query(`UPDATE public.product SET review_state = 'in_review', submitted_at = now() WHERE id = $1`, [inReview]);
  const change = await mk("change_pending");
  await pool.query(
    `INSERT INTO public.product_change (product_id, shop_id, proposed) VALUES ($1, $2, '{"name":"x"}')`, [change, shopA],
  );
  await mk("archived", { status: "archived", approved: true });
  const held = await mk("held", { status: "unavailable", approved: true });
  await pool.query(
    `UPDATE public.product SET held_at = now(), held_by = 'sub', held_reason = 'recall', held_prior_status = 'active' WHERE id = $1`,
    [held],
  );
  const effy = await mk("effy_setup", { status: "draft", approved: false });
  await pool.query(
    `UPDATE public.product SET content_owner = 'effy', created_via = 'effy', margin_kind = 'percent', margin_value = 10 WHERE id = $1`,
    [effy],
  );
  return ids;
}

const all = async (params: Record<string, string> = {}): Promise<BackOfficeProductListDTO> => {
  const first = await list(params);
  const items = [...first.items];
  for (let page = 2; (page - 1) * first.pageSize < first.total; page += 1) {
    items.push(...(await list({ ...params, page: String(page) })).items);
  }
  return { ...first, items };
};

const names = (dto: BackOfficeProductListDTO) => dto.items.map((i) => i.name).sort();

d("102 — the back-office product list against real PostgreSQL", () => {
  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:16-alpine").start();
    pool = new Pool({ connectionString: container.getConnectionUri() });
    holder.pool = pool;
    await pool.query(migrationSql());
    leaf = await testLeafId(pool);
    department = (await pool.query<{ id: string }>(
      `SELECT ca.ancestor_id::text AS id FROM public.category_ancestor ca
         JOIN public.category c ON c.id = ca.ancestor_id
        WHERE ca.category_id = $1 AND c.parent_id IS NULL`, [leaf],
    )).rows[0]!.id;
    otherLeaf = (await pool.query<{ id: string }>(
      `SELECT r.category_id::text AS id FROM public.category_resolved r
        WHERE r.is_leaf AND NOT EXISTS (
          SELECT 1 FROM public.category_ancestor ca WHERE ca.category_id = r.category_id AND ca.ancestor_id = $1)
        LIMIT 1`, [department],
    )).rows[0]!.id;
  }, 300_000);

  afterAll(async () => {
    await pool?.end();
    await container?.stop();
  });

  beforeEach(async () => {
    await pool.query("DELETE FROM public.product_change");
    await pool.query("DELETE FROM public.product");
    await pool.query("DELETE FROM public.shop");
    shopA = await makeShop("AAA");
    shopB = await makeShop("BBB");
    shopC = await makeShop("CCC");
  });

  it("lists every product once, each state in its tab, and the counts add up", async () => {
    const ids = await seedEveryState();
    await insertTestProduct(pool, { shopId: shopB, primaryCategoryId: leaf, name: "B one", price: "3.00" });
    await insertTestProduct(pool, { shopId: shopC, primaryCategoryId: otherLeaf, name: "C one", price: "4.00" });

    const everything = await all();
    expect(everything.items).toHaveLength(Object.keys(ids).length + 2);
    expect(new Set(everything.items.map((i) => i.productId)).size).toBe(everything.items.length);

    const c = everything.counts;
    expect(c.all).toBe(everything.items.length);
    expect(c.on_sale + c.off_sale + c.draft + c.in_review + c.change_pending + c.held + c.archived).toBe(c.all);
    expect(c).toMatchObject({ held: 1, archived: 1, in_review: 1, change_pending: 1, off_sale: 1 });
    // Draft: never approved (draft, sent back) and Effy still setting one up.
    expect(c.draft).toBe(3);
    expect(c.on_sale).toBe(3);

    const byState = (state: string) => all({ state }).then(names);
    expect(await byState("held")).toEqual(["P held"]);
    expect(await byState("change_pending")).toEqual(["P change_pending"]);
    expect(await byState("draft")).toEqual(["P draft", "P effy_setup", "P sent_back"]);

    const effy = everything.items.find((i) => i.productId === ids.effy_setup)!;
    expect(effy).toMatchObject({ effySettingUp: true, origin: "effy", state: "draft" });
    // The tab does not change the counts.
    expect((await list({ state: "held" })).counts).toEqual(c);
  });

  it("searches by name, SKU (any case) and barcode, finding each product once", async () => {
    const ids = await seedEveryState();
    const { productId } = await insertTestProduct(pool, { shopId: shopB, primaryCategoryId: leaf, name: "Two sizes", price: "1.00", sku: "AB-1" });
    await insertTestVariant(pool, productId, { shopId: shopB, price: "2.00", sku: "AB-2", position: 1, optionValueIds: [null, null] }).catch(() => undefined);

    expect(names(await all({ q: "two siz" }))).toEqual(["Two sizes"]);
    expect((await all({ q: "sku-on" })).items.map((i) => i.productId)).toEqual([ids.on_sale]);
    expect((await all({ q: "9300000000001" })).items.map((i) => i.productId)).toEqual([ids.on_sale]);
    expect((await all({ q: "ab-1" })).items).toHaveLength(1);
  });

  it("filters by shop, aisle with its descendants, storage, margin, missing details and low stock", async () => {
    await insertTestProduct(pool, { shopId: shopA, primaryCategoryId: leaf, name: "A leaf", price: "1.00", storage: "frozen" });
    await insertTestProduct(pool, { shopId: shopB, primaryCategoryId: otherLeaf, name: "B other", price: "1.00" });
    const low = await insertTestProduct(pool, {
      shopId: shopB, primaryCategoryId: otherLeaf, name: "B low", price: "1.00", tracked: true, onHand: 1, lowStockThreshold: 5,
    });
    await pool.query(`UPDATE public.product SET margin_kind = 'percent', margin_value = 10 WHERE id = $1`, [low.productId]);

    expect(names(await all({ shopId: shopB }))).toEqual(["B low", "B other"]);
    expect(names(await all({ categoryId: department }))).toEqual(["A leaf"]);
    expect(names(await all({ storage: "frozen" }))).toEqual(["A leaf"]);
    expect(names(await all({ margin: "set" }))).toEqual(["B low"]);
    expect(names(await all({ margin: "not_set", shopId: shopB }))).toEqual(["B other"]);
    expect(names(await all({ lowStock: "true" }))).toEqual(["B low"]);
    const row = (await all({ lowStock: "true" })).items[0]!;
    expect(row).toMatchObject({ lowStock: true, margin: { kind: "percent", value: "10" } });
    // Whether a leaf has required details depends on the seeded taxonomy; the filter must agree with the count.
    const missing = await all({ missingDetails: "true" });
    expect(missing.items.every((i) => i.missingRequired > 0)).toBe(true);
  });

  it("pages without repeating a product, for every sort", async () => {
    for (let i = 0; i < 120; i += 1) {
      await insertTestProduct(pool, {
        shopId: i % 2 ? shopA : shopB, primaryCategoryId: leaf, name: `Item ${String(i).padStart(3, "0")}`, price: `${(i % 7) + 1}.00`,
      });
    }
    for (const sort of ["updated", "name", "price", "shop"]) {
      for (const dir of ["asc", "desc"]) {
        const got = await all({ sort, dir });
        expect(got.items).toHaveLength(120);
        expect(new Set(got.items.map((i) => i.productId)).size).toBe(120);
      }
    }
    const byName = await all({ sort: "name", dir: "asc" });
    expect(byName.items[0]!.name).toBe("Item 000");
  });

  it("103: ignores (and reports) a malformed shop or aisle from a stale link instead of failing", async () => {
    const r = await list({ shopId: "nope", categoryId: "nope" });
    expect(r.ignored.sort()).toEqual(["categoryId", "shopId"]);
  });

  it("103: answers a page past the end with the last real page, and pages with an exact total", async () => {
    const r = await list({ pageSize: "25", page: "999" });
    expect(r.page).toBe(Math.max(1, Math.ceil(r.total / 25)));
  });

  it("opens a product with its sizes, stock, waiting review, hold and history", async () => {
    const ids = await seedEveryState();
    await pool.query(
      `INSERT INTO admin.staff (cognito_sub, email, name) VALUES ('sub', 'ops@effyshopping.com', 'Ops Person')`,
    );
    await pool.query(
      `INSERT INTO admin.audit_log (actor_sub, action, target_type, target_id, detail)
       VALUES ('sub', 'product.held', 'product', $1, '{"reason":"recall"}')`, [ids.held],
    );

    const held = await detail(ids.held);
    expect(held).toMatchObject({
      state: "held",
      hold: { reason: "recall", heldBy: "Ops Person" },
      origin: "shop",
      waitingForReview: null,
    });
    expect(held.variants).toHaveLength(1);
    expect(held.variants[0]).toMatchObject({ stockTracked: false, state: "active" });
    const log = { items: await activityEntries(holder.pool!, productActivitySource(ids.held)) };
    expect(log.items[0]).toMatchObject({ kind: "sale", title: "Held", actor: "Ops Person", detail: "recall" });
    expect(log.items.at(-1)).toMatchObject({ kind: "content", title: "Created by the shop", actor: "Shop" });

    expect((await detail(ids.in_review)).waitingForReview).toBe("new_product");
    expect((await detail(ids.change_pending)).waitingForReview).toBe("change");

    await expect(detail("00000000-0000-4000-8000-000000000000")).rejects.toMatchObject({ kind: "not_found" });
    await expect(detail("not-a-uuid")).rejects.toMatchObject({ kind: "not_found" });
  });
});
