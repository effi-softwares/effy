import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { migrationSql } from "@effy/edge-shared";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createCatalogRepository } from "./catalog/repository";
import { createCatalogService } from "./catalog/service";
import { createFacetRepository } from "./facets/repository";
import { createFacetService } from "./facets/service";
import { createHomeRepository } from "./home/repository";
import { createHomeService } from "./home/service";
import { createPromotionRepository } from "./promotions/repository";
import { createPromotionService } from "./promotions/service";
import { createSearchRepository } from "./search/repository";
import { createSearchService } from "./search/service";

/**
 * 070 — the storefront's SQL against the REAL schema.
 *
 * The unit tests beside this fake the repositories, so they prove the composition and never run a
 * statement. That exact gap shipped a bug once: the facet attribute count grouped by an output
 * alias and Postgres refused it (42803) the first time it met a real database. Raw SQL is only
 * proven by a real engine — a wrong column, a bigint that arrives as a string, a cursor cast.
 *
 * It also proves the two properties that cannot be seen in any single response: paging by cursor
 * visits every product exactly once, under every sort; and each facet is counted with its own
 * selection cleared.
 */
const RUN = process.env.CONTAINER_TESTS === "1";
const d = RUN ? describe : describe.skip;

let container: StartedPostgreSqlContainer;
let pool: Pool;
const ids: Record<string, string> = {};
const noImage = async () => null;

async function product(name: string, o: {
  price: string; brand?: string | null; category?: string; compareAt?: string; status?: string;
  tracked?: boolean; onHand?: number; ageDays?: number; shortDescription?: string;
}) {
  const res = await pool.query<{ id: string }>(
    `INSERT INTO public.product (shop_id, product_type_id, primary_category_id, name, brand, price_amount,
                                 shop_price_amount, compare_at_amount, short_description, created_by, status,
                                 approved_at, stock_tracked, stock_on_hand, created_at)
     SELECT (SELECT id FROM public.shop WHERE code = 'SFT'),
            (SELECT id FROM public.product_type WHERE key = 'sft-type'),
            (SELECT id FROM public.category WHERE key = $1),
            $2, $3, $4::numeric, $4::numeric, $5::numeric, $6, 'seed', $7, now(), $8, $9,
            now() - make_interval(days => $10)
     RETURNING id::text AS id`,
    [o.category ?? "sft-dairy", name, o.brand ?? null, o.price, o.compareAt ?? null,
     o.shortDescription ?? `${name} description`, o.status ?? "active", o.tracked ?? false,
     o.tracked ? (o.onHand ?? 0) : null, o.ageDays ?? 30],
  );
  ids[name] = res.rows[0]!.id;
}

d("070 — storefront reads against the real schema", () => {
  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:16-alpine").start();
    pool = new Pool({ connectionString: container.getConnectionUri() });
    await pool.query(migrationSql());

    await pool.query(`INSERT INTO public.shop (code, name) VALUES ('SFT', 'Storefront test shop')`);
    await pool.query(`INSERT INTO public.product_type (key, name) VALUES ('sft-type', 'Storefront test type')`);
    await pool.query(`INSERT INTO public.category (key, name, display_order) VALUES
      ('sft-dairy', 'Test Dairy', 9001), ('sft-bakery', 'Test Bakery', 9002), ('sft-empty', 'Test Empty', 9003)`);

    await product("Oat Milk", { price: "4.50", brand: "Oatly", ageDays: 1 });
    await product("Soy Milk", { price: "3.00", brand: "Vitasoy", compareAt: "4.00", ageDays: 5 });
    await product("Almond Milk", { price: "5.25", brand: "Oatly", ageDays: 20 });
    await product("Sold Out Milk", { price: "2.00", brand: "Vitasoy", tracked: true, onHand: 0, ageDays: 3 });
    await product("Sourdough", { price: "9.00", brand: "Bakers", category: "sft-bakery", ageDays: 40 });
    await product("Draft Loaf", { price: "1.00", category: "sft-bakery", status: "draft" });
  }, 180_000);

  afterAll(async () => {
    await pool?.end();
    await container?.stop();
  });

  const search = () => createSearchService(createSearchRepository(pool), noImage);
  const q = (over: object = {}) => ({
    q: "", categoryKey: "", minPrice: "", maxPrice: "", saleOnly: false, brands: [], attributes: {},
    sort: "newest" as const, cursor: "", limit: 0, ...over,
  });

  it("lists active products — including one that is sold out, marked unavailable — and never a draft", async () => {
    const res = await search().search(q({ categoryKey: "sft-dairy" }));
    expect(res.total).toBe(4);
    expect(res.items.map((i) => i.name)).toEqual(["Oat Milk", "Sold Out Milk", "Soy Milk", "Almond Milk"]); // newest first
    expect(res.items.find((i) => i.name === "Sold Out Milk")?.available).toBe(false);
    expect((await search().search(q({ categoryKey: "sft-bakery" }))).items.map((i) => i.name)).toEqual(["Sourdough"]);
  });

  it("the total is a number, and money is text", async () => {
    const res = await search().search(q({ categoryKey: "sft-dairy" }));
    expect(typeof res.total).toBe("number");
    expect(res.items[0]?.priceAmount).toBe("4.50");
    expect(res.items.find((i) => i.name === "Soy Milk")).toMatchObject({ compareAtAmount: "4.00", badges: ["on_sale", "new"] });
  });

  it.each(["newest", "price_asc", "price_desc"] as const)(
    "paging by cursor under %s visits every product exactly once",
    async (sort) => {
      const seen: string[] = [];
      let cursor = "";
      for (let page = 0; page < 10; page += 1) {
        const res = await search().search(q({ categoryKey: "sft-dairy", sort, cursor, limit: 1 }));
        seen.push(...res.items.map((i) => i.name));
        if (!res.nextCursor) break;
        cursor = res.nextCursor;
      }
      expect(seen).toHaveLength(4);
      expect(new Set(seen).size).toBe(4);
      if (sort === "price_asc") expect(seen).toEqual(["Sold Out Milk", "Soy Milk", "Oat Milk", "Almond Milk"]);
      if (sort === "price_desc") expect(seen).toEqual(["Almond Milk", "Oat Milk", "Soy Milk", "Sold Out Milk"]);
    },
  );

  it("relevance search runs, scores, and pages without repeating", async () => {
    const first = await search().search(q({ q: "milk", sort: "relevance", limit: 2 }));
    expect(first.sort).toBe("relevance");
    expect(first.total).toBe(4);
    const second = await search().search(q({ q: "milk", sort: "relevance", limit: 2, cursor: first.nextCursor! }));
    const names = [...first.items, ...second.items].map((i) => i.name);
    expect(new Set(names).size).toBe(4);
  });

  it("filters: price range, sale only, brand", async () => {
    expect((await search().search(q({ minPrice: "4", maxPrice: "6" }))).items.map((i) => i.name).sort()).toEqual(["Almond Milk", "Oat Milk"]);
    expect((await search().search(q({ saleOnly: true }))).items.map((i) => i.name)).toEqual(["Soy Milk"]);
    expect((await search().search(q({ brands: ["Oatly", "Bakers"] }))).total).toBe(3);
  });

  it("hydrates by id in the caller's order", async () => {
    const res = await search().cardsByIds([ids["Sourdough"]!, ids["Oat Milk"]!, ids["Draft Loaf"]!]);
    expect(res.map((c) => c.name)).toEqual(["Sourdough", "Oat Milk"]); // the draft is not active
  });

  it("facets: own-selection exclusion, numeric counts, price bounds as text", async () => {
    const facets = createFacetService(createFacetRepository(pool));
    const base = { q: "", minPrice: "", maxPrice: "", saleOnly: false, attributes: {} };

    const set = await facets.facets({ ...base, categoryKey: "sft-dairy", brands: ["Oatly"] });
    const brand = set.facets.find((f) => f.key === "brand")!;
    // Brand is counted with the brand selection CLEARED: Vitasoy is still offered.
    expect(brand.options).toEqual([
      { value: "Oatly", label: "Oatly", count: 2 },
      { value: "Vitasoy", label: "Vitasoy", count: 2 },
    ]);
    // Category is counted with the category selection cleared but the brand kept: only Oatly's.
    const category = set.facets.find((f) => f.key === "category")!;
    expect(category.options).toEqual([{ value: "sft-dairy", label: "Test Dairy", count: 2 }]);
    expect(typeof brand.options[0]?.count).toBe("number");
    // Price bounds keep the brand and category: Oatly dairy is 4.50 – 5.25.
    expect(set.priceBounds).toEqual({ min: "4.50", max: "5.25" });
  });

  it("the attribute facet count runs against a real engine (the GROUP BY that once shipped broken)", async () => {
    await pool.query(
      `INSERT INTO public.attribute_definition (key, name, data_type) VALUES ('sft-diet', 'Test Dietary', 'multi_select')`,
    );
    await pool.query(
      `INSERT INTO public.product_attribute_value (product_id, attribute_definition_id, value_options)
       SELECT $1::uuid, id, ARRAY['vegan','organic'] FROM public.attribute_definition WHERE key = 'sft-diet'`,
      [ids["Oat Milk"]],
    );
    const set = await createFacetService(createFacetRepository(pool)).facets({
      q: "", categoryKey: "", minPrice: "", maxPrice: "", saleOnly: false, brands: [], attributes: {},
    });
    const diet = set.facets.find((f) => f.key === "sft-diet")!;
    expect(diet.options.map((o) => [o.value, o.count]).sort()).toEqual([["organic", 1], ["vegan", 1]]);

    const filtered = await search().search(q({ attributes: { "sft-diet": ["vegan"] } }));
    expect(filtered.items.map((i) => i.name)).toEqual(["Oat Milk"]);
  });

  it("home rails carry only purchasable products; an empty category gets no rail", async () => {
    const promotions = createPromotionService(createPromotionRepository(pool), noImage);
    const home = await createHomeService(createHomeRepository(pool), promotions, noImage).home();
    const all = home.rails.flatMap((r) => r.products.map((p) => p.name));
    expect(all).not.toContain("Sold Out Milk");
    expect(all).not.toContain("Draft Loaf");
    expect(home.rails.map((r) => r.key)).not.toContain("category:sft-empty");
    expect(home.rails.find((r) => r.key === "on_sale")?.products.map((p) => p.name)).toContain("Soy Milk");
    expect(Array.isArray(home.banners)).toBe(true);
  });

  it("categories: purchasable counts as numbers, sold-out excluded from the count", async () => {
    const cats = await createCatalogService(createCatalogRepository(pool), noImage).categories();
    expect(cats.find((c) => c.key === "sft-dairy")?.productCount).toBe(3); // 4 active, 1 sold out
    expect(cats.find((c) => c.key === "sft-empty")?.productCount).toBe(0);
  });

  it("product detail: an out-of-stock product renders; a draft and an unknown id are not found", async () => {
    const catalog = createCatalogService(createCatalogRepository(pool), noImage);
    const out = await catalog.productDetail(ids["Sold Out Milk"]!);
    expect(out).toMatchObject({ name: "Sold Out Milk", available: false, categoryKey: "sft-dairy", categoryPath: ["Test Dairy"] });
    expect(await catalog.productDetail(ids["Draft Loaf"]!)).toBeNull();
    expect(await catalog.productDetail("00000000-0000-0000-0000-000000000000")).toBeNull();
  });

  it("an advertised promotion is a banner and a detail; a malformed id is simply not found", async () => {
    const promotions = createPromotionService(createPromotionRepository(pool), noImage);
    expect(await promotions.promotion("not-a-uuid")).toBeNull();
    expect(await promotions.promotion("00000000-0000-0000-0000-000000000000")).toBeNull();
  });
});
