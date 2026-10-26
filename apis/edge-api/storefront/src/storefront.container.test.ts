import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { insertTestProduct, migrationSql } from "@effy/edge-shared/testing";
import { applyVariantSet, priceVariants } from "@effy/edge-shared/catalog";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createCatalogRepository } from "./catalog/repository";
import { createCatalogService } from "./catalog/service";
import { createFacetRepository } from "./facets/repository";
import { createFacetService } from "./facets/service";
import { createHomeRepository } from "./home/repository";
import { createHomeService } from "./home/service";
import { createPromotionService } from "./promotions/service";
import { createSearchRepository } from "./search/repository";
import { TRIGRAM_EXPR } from "./search/filters";
import { createSearchService } from "./search/service";
import { createSuggestRepository } from "./suggest/repository";

/**
 * The storefront's SQL against a real database, plus what no single response shows: cursor paging
 * visits every product once under every sort, and each facet is counted with its own selection cleared.
 */
const RUN = process.env.CONTAINER_TESTS === "1";
const d = RUN ? describe : describe.skip;

let container: StartedPostgreSqlContainer;
let pool: Pool;
const ids: Record<string, string> = {};
const variantIds: Record<string, string> = {};
const noImage = async () => null;

async function product(name: string, o: {
  price: string; brand?: string | null; category?: string; compareAt?: string; status?: string;
  tracked?: boolean; onHand?: number; ageDays?: number; shortDescription?: string; sku?: string;
}) {
  // A product and its one variant, as the one writer would leave them.
  const one = async (sql: string, args: unknown[]) => (await pool.query<{ id: string }>(sql, args)).rows[0]!.id;
  const created = await insertTestProduct(pool, {
    shopId: await one(`SELECT id::text FROM public.shop WHERE code = 'SFT'`, []),
    primaryCategoryId: await one(`SELECT id::text FROM public.category WHERE key = $1`, [o.category ?? "sft-dairy"]),
    name, brand: o.brand ?? null, price: o.price, compareAt: o.compareAt ?? null,
    shortDescription: o.shortDescription ?? `${name} description`,
    status: (o.status ?? "active") as "active", approved: true,
    tracked: o.tracked ?? false, onHand: o.tracked ? (o.onHand ?? 0) : null, sku: o.sku ?? null,
  });
  await pool.query(`UPDATE public.product SET created_at = now() - make_interval(days => $2) WHERE id = $1`, [created.productId, o.ageDays ?? 30]);
  ids[name] = created.productId;
  variantIds[name] = created.variantId;
}

d("070 — storefront reads against the real schema", () => {
  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:16-alpine").start();
    pool = new Pool({ connectionString: container.getConnectionUri() });
    await pool.query(migrationSql());

    await pool.query(`INSERT INTO public.shop (code, name) VALUES ('SFT', 'Storefront test shop')`);
    await pool.query(`INSERT INTO public.category (key, name, "position") VALUES
      ('sft-dairy', 'Test Dairy', 9001), ('sft-bakery', 'Test Bakery', 9002), ('sft-empty', 'Test Empty', 9003)`);
    // Test departments beside the seeded taxonomy; the derived closure makes them aisles.
    await pool.query(`SELECT public.rebuild_category_derived()`);

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

  it("TRIGRAM_EXPR is product_search_trgm_idx's expression, or every search is a scan", async () => {
    const indexDef = async (name: string) =>
      (await pool.query<{ def: string }>(`SELECT pg_get_indexdef($1::regclass) AS def`, [`public.${name}`])).rows[0]!.def;
    await pool.query(`CREATE INDEX trgm_probe ON public.product USING gin ((${TRIGRAM_EXPR.replace(/\bp\./g, "")}) public.gin_trgm_ops)`);
    try {
      expect((await indexDef("trgm_probe")).replace("trgm_probe", "product_search_trgm_idx")).toBe(await indexDef("product_search_trgm_idx"));
    } finally {
      await pool.query(`DROP INDEX public.trgm_probe`);
    }
  });

  const search = () => createSearchService(createSearchRepository(pool), noImage);
  const q = (over: object = {}) => ({
    q: "", categoryKey: "", minPrice: "", maxPrice: "", saleOnly: false, brands: [], attributes: {}, ranges: {},
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
    const facets = createFacetService(createFacetRepository(pool), (keys) => createSearchRepository(pool).rangeUnits(keys));
    const base = { q: "", minPrice: "", maxPrice: "", saleOnly: false, attributes: {}, ranges: {} };

    const set = await facets.facets({ ...base, categoryKey: "sft-dairy", brands: ["Oatly"] });
    const brand = set.facets.find((f) => f.key === "brand")!;
    // Brand is counted with the brand selection cleared: Vitasoy is still offered.
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

  it("101 — attribute facets follow the aisle's form: AND across, ranges in base units, hidden and internal never count", async () => {
    const one = async (sql: string, args: unknown[] = []) => (await pool.query<{ id: string }>(sql, args)).rows[0]!.id;
    const dairy = await one(`SELECT id::text FROM public.category WHERE key = 'sft-dairy'`);
    const attr = (key: string) => one(`SELECT id::text FROM public.attribute_definition WHERE key = $1`, [key]);
    const val = (key: string, label: string) => one(
      `SELECT v.id::text FROM public.attribute_allowed_value v JOIN public.attribute_definition ad ON ad.id = v.attribute_definition_id
        WHERE ad.key = $1 AND v.label = $2`, [key, label]);
    const [dietary, weight, organic, supplier] = await Promise.all([attr("dietary"), attr("weight"), attr("organic"), attr("supplier_code")]);
    const [vegan, glutenFree] = await Promise.all([val("dietary", "Vegan"), val("dietary", "Gluten free")]);
    for (const [a, level] of [[dietary, "optional"], [weight, "optional"], [organic, "optional"], [supplier, "optional"]] as const) {
      await pool.query(`INSERT INTO public.category_attribute (category_id, attribute_id, level) VALUES ($1, $2, $3)`, [dairy, a, level]);
    }
    await pool.query(`SELECT public.rebuild_category_derived()`);
    const put = (product: string, a: string, col: string, v: unknown, extra = "") =>
      pool.query(`INSERT INTO public.product_attribute_value (product_id, attribute_definition_id, ${col}${extra ? ", value_unit, value_base" : ""})
                  VALUES ($1, $2, $3${extra})`, [ids[product], a, v]);
    await put("Oat Milk", dietary, "allowed_value_ids", [vegan, glutenFree]);
    await put("Soy Milk", dietary, "allowed_value_ids", [vegan]);
    await put("Oat Milk", weight, "value_number", "1", ", 'kg', 1000");
    await put("Soy Milk", weight, "value_number", "500", ", 'g', 500");
    await put("Almond Milk", organic, "value_boolean", true);
    await put("Oat Milk", supplier, "value_text", "SUP-1");

    const facets = createFacetService(createFacetRepository(pool), (keys) => createSearchRepository(pool).rangeUnits(keys));
    const base = { q: "", minPrice: "", maxPrice: "", saleOnly: false, brands: [], attributes: {}, ranges: {} };
    const set = await facets.facets({ ...base, categoryKey: "sft-dairy" });
    const diet = set.facets.find((f) => f.key === "dietary")!;
    expect(diet.options.map((o) => [o.label, o.count])).toEqual([["Vegan", 2], ["Gluten free", 1]]);
    expect(set.facets.find((f) => f.key === "weight")).toMatchObject({ type: "range", range: { min: "0.5", max: "1", unit: "kg" } });
    expect(set.facets.find((f) => f.key === "organic")?.options).toEqual([{ value: "true", label: "Yes", count: 1 }]);
    expect(set.facets.find((f) => f.key === "supplier_code")).toBeUndefined();

    // OR within one attribute, AND across: Vegan or Gluten free, AND weight from 0.75 kg.
    const both = await search().search(q({ categoryKey: "sft-dairy", attributes: { dietary: [vegan, glutenFree] }, ranges: { weight: { min: "0.75", max: "" } } }));
    expect(both.items.map((i) => i.name)).toEqual(["Oat Milk"]);
    const veganOnly = await search().search(q({ categoryKey: "sft-dairy", attributes: { dietary: [vegan] } }));
    expect(veganOnly.items.map((i) => i.name).sort()).toEqual(["Oat Milk", "Soy Milk"]);

    // Staff hide Dietary on the aisle: the values stay stored but no longer filter or show.
    await pool.query(`UPDATE public.category_attribute SET level = NULL, hidden = true WHERE category_id = $1 AND attribute_id = $2`, [dairy, dietary]);
    await pool.query(`SELECT public.rebuild_category_derived()`);
    expect((await facets.facets({ ...base, categoryKey: "sft-dairy" })).facets.find((f) => f.key === "dietary")).toBeUndefined();
    expect((await search().search(q({ attributes: { dietary: [vegan] } }))).items).toEqual([]);

    // The product page shows customer-visible details only.
    const page = await createCatalogService(createCatalogRepository(pool), noImage).productDetail(ids["Oat Milk"]!);
    const labels = page!.variants[0]!.details.flatMap((g) => g.items.map((i) => i.label));
    expect(labels).toContain("Weight");
    expect(labels).not.toContain("Supplier code");
    expect(labels).not.toContain("Dietary labels");
  });

  it("home rails carry only purchasable products; an empty category gets no rail", async () => {
    const home = await createHomeService(createHomeRepository(pool), noImage).home();
    const all = home.rails.flatMap((r) => r.products.map((p) => p.name));
    expect(all).not.toContain("Sold Out Milk");
    expect(all).not.toContain("Draft Loaf");
    expect(home.rails.map((r) => r.key)).not.toContain("category:sft-empty");
    expect(home.rails.find((r) => r.key === "on_sale")?.products.map((p) => p.name)).toContain("Soy Milk");
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

  it("094 — a product covered by an item offer open to everyone shows its label; others show none", async () => {
    const promo = (await pool.query<{ id: string }>(
      `INSERT INTO public.promotion (name, kind, trigger, value_type, percent_off, applies_to, created_by, published_at)
       VALUES ('Dairy 15', 'item', 'automatic', 'percent', 15, 'products', 'seed', now() - interval '1 minute') RETURNING id::text AS id`,
    )).rows[0]!.id;
    await pool.query(`INSERT INTO public.promotion_target (promotion_id, target_type, product_id) VALUES ($1, 'product', $2)`, [promo, ids["Oat Milk"]]);
    const cards = await createSearchService(createSearchRepository(pool), noImage).cardsByIds([ids["Oat Milk"]!, ids["Sourdough"]!]);
    const byName = new Map(cards.map((c) => [c.name, c]));
    expect(byName.get("Oat Milk")?.offer).toEqual({ promotionId: promo, label: "15% off" });
    expect(byName.get("Sourdough")?.offer).toBeUndefined();
    await pool.query(`UPDATE public.promotion SET paused = true WHERE id = $1`, [promo]);
  });

  it("094 — a group answers its live, everyone-audience promotions in order; a promotion page is public only while live", async () => {
    const promotions = createPromotionService(pool);
    expect(await promotions.promotion("not-a-uuid")).toBeNull();
    expect(await promotions.promotion("00000000-0000-0000-0000-000000000000")).toBeNull();
    const ins = async (name: string, extra = "") =>
      (await pool.query<{ id: string }>(
        `INSERT INTO public.promotion (name, kind, trigger, value_type, amount_off, applies_to, headline, created_by, published_at${extra ? ", audience" : ""})
         VALUES ($1, 'cart', 'automatic', 'amount', 5, 'cart', $1, 'seed', now() - interval '1 minute'${extra ? `, '${extra}'` : ""}) RETURNING id::text AS id`,
        [name],
      )).rows[0]!.id;
    const a = await ins("Five off");
    const b = await ins("Welcome", "first_order");
    const g = (await pool.query<{ id: string }>(`SELECT id::text FROM public.promotion_group WHERE key = 'home-hero'`)).rows[0]!.id;
    await pool.query(`INSERT INTO public.promotion_group_member (group_id, promotion_id, position) VALUES ($1, $2, 0), ($1, $3, 1)`, [g, b, a]);
    const [hero, unknown] = await promotions.groups(["home-hero", "nope"]);
    expect(hero!.promotions.map((p) => p.headline)).toEqual(["Five off"]);
    expect(unknown).toEqual({ key: "nope", promotions: [] });
    expect(await promotions.promotion(a)).toMatchObject({ title: "Five off", code: "" });
    expect(await promotions.promotion(b)).toBeNull();
  });

  /**
   * The suggestion statements use their trigram indexes on 50k products (in a rolled-back transaction,
   * sequential scans off).
   */
  it("suggestions are served by the name and brand trigram indexes", async () => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(`
        INSERT INTO public.product (shop_id, primary_category_id, storage, gst_status, age_restricted, name, brand,
                                    short_description, created_by, status, approved_at)
        SELECT (SELECT id FROM public.shop WHERE code = 'SFT'),
               (SELECT id FROM public.category WHERE key = 'sft-bakery'), 'ambient', 'gst_free', false,
               (array['Oat','Soy','Rye','Full cream','Greek','Spelt','Basil','Apple','Cheddar','Rice'])[1 + g % 10] || ' ' ||
               (array['loaf','yoghurt','roll','bunch','block','juice','pasta','butter'])[1 + (g / 10) % 8] || ' ' || g,
               'Maker ' || (g % 400), 'x', 'seed', 'active', now()
        FROM generate_series(1, 50000) g`);
      await client.query("ANALYZE public.product");
      // Scans off makes the question stable: can the index answer this statement?
      await client.query("SET LOCAL enable_seqscan = off");
      const plans: string[] = [];
      const explaining = { query: async (sql: string, args: unknown[]) => {
        plans.push((await client.query(`EXPLAIN ${sql}`, args)).rows.map((r) => r["QUERY PLAN"]).join("\n"));
        return { rows: [] };
      } };
      const suggest = createSuggestRepository(explaining as never);
      await suggest.products("cheddar block 12", 5);
      await suggest.completions("cheddar block 12", 5);
      await suggest.aislesHolding("cheddar block 12", 5);
      expect(plans).toHaveLength(3);
      for (const plan of plans) {
        expect(plan).toContain("product_name_trgm_idx");
        expect(plan).not.toMatch(/Seq Scan on product\b/);
      }
      expect(plans[1]).toContain("product_brand_trgm_idx");
    } finally {
      await client.query("ROLLBACK");
      client.release();
    }
  }, 60_000); // fifty thousand rows into trigram-indexed tables: seconds, not milliseconds

  /** Every picture address on the wire is the cdn's, unsigned; a key outside the public set gets none. */
  it("every picture address a shopper is sent is permanent and unsigned", async () => {
    const before = process.env.MEDIA_PUBLIC_BASE_URL;
    process.env.MEDIA_PUBLIC_BASE_URL = "https://media.test";
    try {
      await pool.query(
        `INSERT INTO public.product_media (product_id, storage_key, is_primary, display_order, alt_text) VALUES
           ($1, 'products/oat/0.jpg', true, 0, 'Front'),
           ($1, 'products/oat/1.jpg', false, 1, NULL),
           ($2, 'courier-label/parcel-1.pdf', true, 0, NULL)`,
        [ids["Oat Milk"], ids["Sourdough"]],
      );
      await pool.query(
        `INSERT INTO public.media_rendition (storage_key, status, widths) VALUES ('products/oat/0.jpg', 'ready', '{160,320}')`,
      );

      const answers: unknown[] = [
        await createSearchService(createSearchRepository(pool)).search(q({ categoryKey: "sft-dairy" })),
        await createSearchService(createSearchRepository(pool)).cardsByIds([ids["Oat Milk"]!, ids["Sourdough"]!]),
        await createHomeService(createHomeRepository(pool)).home(),
        await createCatalogService(createCatalogRepository(pool)).categories(),
        await createCatalogService(createCatalogRepository(pool)).productDetail(ids["Oat Milk"]!),
        await createCatalogService(createCatalogRepository(pool)).productDetail(ids["Sourdough"]!),
      ];

      const urls: string[] = [];
      const walk = (v: unknown, key = ""): void => {
        if (Array.isArray(v)) v.forEach((x) => walk(x, key));
        else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) walk(x, k);
        else if (typeof v === "string" && /url$/i.test(key)) urls.push(v);
      };
      walk(answers);

      expect(urls.length).toBeGreaterThan(3); // it found the pictures — a walk that finds none passes anything
      for (const url of urls) {
        expect(url).toMatch(/^https:\/\/media\.test\/(products|promotions|renditions)\//);
        expect(url).not.toMatch(/[?#]|X-Amz|Signature|amazonaws/i);
      }
      expect(urls.some((u) => u.includes("courier-label"))).toBe(false);
      const loaf = answers[5] as { imageUrl: string | null; gallery: unknown[] };
      expect(loaf.imageUrl).toBeNull();
      expect(loaf.gallery).toEqual([]);
    } finally {
      if (before === undefined) delete process.env.MEDIA_PUBLIC_BASE_URL;
      else process.env.MEDIA_PUBLIC_BASE_URL = before;
    }
  });

  it("098 — one tile per product, From the cheapest ACTIVE size; the page lists only active sizes", async () => {
    const one = async (sql: string, args: unknown[] = []) => (await pool.query<{ id: string }>(sql, args)).rows[0]!.id;
    const shopId = await one(`SELECT id::text FROM public.shop WHERE code = 'SFT'`);
    const { productId } = await insertTestProduct(pool, {
      shopId,
      primaryCategoryId: await one(`SELECT id::text FROM public.category WHERE key = 'sft-bakery'`),
      name: "Basmati Rice", price: "1.00", status: "draft", approved: false,
    });
    const u = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(`UPDATE public.product SET unit_basis = 'per_kg' WHERE id = $1`, [productId]);
      await applyVariantSet(client, {
        productId, shopId, mode: "draft",
        options: [{ id: u(1), position: 1, kind: "pack_size", values: [{ id: u(2), position: 0 }, { id: u(3), position: 1 }, { id: u(4), position: 2 }] }],
        variants: [
          { id: u(10), position: 0, optionValueIds: [u(2), null], shopPriceAmount: "3.20", sku: "RICE-500", packQuantity: "500", packUnit: "g" },
          { id: u(11), position: 1, optionValueIds: [u(3), null], shopPriceAmount: "5.50", gtin: "9300000000011", packQuantity: "1", packUnit: "kg" },
          { id: u(12), position: 2, optionValueIds: [u(4), null], shopPriceAmount: "2.00", packQuantity: "5", packUnit: "kg" },
        ],
      });
      await client.query(`UPDATE public.product SET status = 'active', approved_at = now() WHERE id = $1`, [productId]);
      await priceVariants(client, productId, { kind: "percent", value: "10" });
      // The 5 kg is switched off: it must leave the listing price and the page.
      await client.query(`UPDATE public.product_variant SET state = 'inactive' WHERE id = $1`, [u(12)]);
      const { refreshListing } = await import("@effy/edge-shared/catalog");
      await refreshListing(client, productId);
      await client.query("COMMIT");
    } finally {
      client.release();
    }

    const search = createSearchService(createSearchRepository(pool), noImage);
    const found = await search.search({ q: "basmati", categoryKey: "", minPrice: "", maxPrice: "", saleOnly: false, brands: [], attributes: {}, ranges: {}, sort: "relevance", cursor: "", limit: 20 } as never);
    const tiles = found.items.filter((c) => c.id === productId);
    expect(tiles).toHaveLength(1);
    expect(tiles[0]).toMatchObject({ priceAmount: "3.52", priceVaries: true, variantCount: 2, unitPrice: { amount: "7.04", basis: "per_kg" } });

    // A query that IS a stock code finds the product and opens it on that size.
    const byCode = await search.search({ q: "RICE-500", categoryKey: "", minPrice: "", maxPrice: "", saleOnly: false, brands: [], attributes: {}, ranges: {}, sort: "relevance", cursor: "", limit: 20 } as never);
    expect(byCode.items.find((c) => c.id === productId)?.variantId).toBe(u(10));

    const page = await createCatalogService(createCatalogRepository(pool), noImage).productDetail(productId);
    expect(page?.variants.map((v) => [v.label, v.priceAmount])).toEqual([["500 g", "3.52"], ["1 kg", "6.05"]]);
    expect(page?.options[0]).toMatchObject({ kind: "pack_size", name: "Pack size" });
    expect(page?.options[0]?.values.map((v) => v.value)).toEqual(["500 g", "1 kg"]);
    expect(page?.defaultVariantId).toBe(u(10));
  });
});
