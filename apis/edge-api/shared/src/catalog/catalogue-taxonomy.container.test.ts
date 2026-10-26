import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { isStockDateName } from "@effy/shared-types";

import { migrationSql } from "../testing/migrations";

/** The seeded general-retailer taxonomy (101) against real PostgreSQL: its shape and its inheritance rules. */

const RUN = process.env.CONTAINER_TESTS === "1";
const d = RUN ? describe : describe.skip;

let container: StartedPostgreSqlContainer;
let pool: Pool;

const DEPARTMENTS = [
  "Fruit & Vegetables", "Meat & Seafood", "Dairy, Eggs & Fridge", "Bakery", "Pantry", "Frozen", "Snacks & Confectionery",
  "Drinks", "Liquor", "Ready Meals & Deli", "Health & Wellness", "Beauty & Personal Care", "Baby", "Pet",
  "Household & Cleaning", "Home & Kitchen", "Electronics", "Toys & Games", "Clothing & Accessories", "Garden & Outdoor",
  "Hardware & Tools", "Office & Stationery", "Sports & Fitness", "Automotive", "Party & Entertaining",
];
const FOOD = ["Fruit & Vegetables", "Meat & Seafood", "Dairy, Eggs & Fridge", "Bakery", "Pantry", "Frozen",
  "Snacks & Confectionery", "Drinks", "Ready Meals & Deli"];

const rows = async <T>(sql: string, args: unknown[] = []) => (await pool.query(sql, args)).rows as T[];

d("101 — the seeded catalogue taxonomy", () => {
  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:16-alpine").start();
    pool = new Pool({ connectionString: container.getConnectionUri() });
    await pool.query(migrationSql());
  }, 300_000);

  afterAll(async () => {
    await pool?.end();
    await container?.stop();
  });

  it("has the 25 departments, each with leaves, at most five levels deep", async () => {
    const depts = await rows<{ name: string; leaves: number }>(`
      SELECT c.name, count(*) FILTER (WHERE r.is_leaf)::int AS leaves
        FROM public.category c
        JOIN public.category_ancestor a ON a.ancestor_id = c.id
        JOIN public.category_resolved r ON r.category_id = a.category_id
       WHERE c.parent_id IS NULL
       GROUP BY c.name`);
    expect(depts.map((x) => x.name).sort()).toEqual([...DEPARTMENTS].sort());
    for (const dpt of depts) expect(dpt.leaves, dpt.name).toBeGreaterThan(0);
    const [depth] = await rows<{ max: number }>(`SELECT max(depth)::int AS max FROM public.category_resolved`);
    expect(depth!.max).toBeLessThanOrEqual(5);
    const [count] = await rows<{ n: number }>(`SELECT count(*)::int AS n FROM public.category WHERE status = 'active'`);
    expect(count!.n).toBeGreaterThanOrEqual(600);
  });

  it("names siblings uniquely", async () => {
    const dup = await rows(`
      SELECT parent_id, lower(name) FROM public.category WHERE status = 'active'
       GROUP BY parent_id, lower(name) HAVING count(*) > 1`);
    expect(dup).toEqual([]);
  });

  it("resolves all three facts on every leaf: 18+ exactly under Liquor, apart from its non-alcoholic drinks", async () => {
    const unresolved = await rows(`
      SELECT array_to_string(path_names, ' › ') AS path FROM public.category_resolved
       WHERE is_leaf AND (storage IS NULL OR gst_status IS NULL OR age_restricted IS NULL)`);
    expect(unresolved).toEqual([]);
    const adult = await rows<{ path: string }>(`
      SELECT array_to_string(path_names, ' › ') AS path FROM public.category_resolved WHERE is_leaf AND age_restricted`);
    expect(adult.length).toBeGreaterThan(0);
    for (const a of adult) {
      expect(a.path.startsWith("Liquor › ")).toBe(true);
      expect(a.path).not.toContain("Non-Alcoholic");
    }
  });

  it("never loosens an inherited level", async () => {
    const loosened = await rows(`
      SELECT c.name, ad.name AS attribute
        FROM public.category_attribute ca
        JOIN public.category c ON c.id = ca.category_id
        JOIN public.attribute_definition ad ON ad.id = ca.attribute_id
        JOIN public.category_form parent ON parent.category_id = c.parent_id AND parent.attribute_id = ca.attribute_id
       WHERE NOT ca.hidden
         AND array_position(ARRAY['optional','recommended','required'], ca.level)
           < array_position(ARRAY['optional','recommended','required'], parent.level)`);
    expect(loosened).toEqual([]);
  });

  it("requires allergens and country of origin on food, except allergens on whole produce", async () => {
    const leaves = await rows<{ path: string; allergens: string | null; origin: string | null }>(`
      SELECT array_to_string(r.path_names, ' › ') AS path,
             (SELECT f.level FROM public.category_form f JOIN public.attribute_definition ad ON ad.id = f.attribute_id
               WHERE f.category_id = r.category_id AND ad.key = 'allergens') AS allergens,
             (SELECT f.level FROM public.category_form f JOIN public.attribute_definition ad ON ad.id = f.attribute_id
               WHERE f.category_id = r.category_id AND ad.key = 'country_of_origin') AS origin
        FROM public.category_resolved r
       WHERE r.is_leaf AND r.path_names[1] = ANY($1::text[])`, [FOOD]);
    expect(leaves.length).toBeGreaterThan(100);
    for (const leaf of leaves) {
      expect(leaf.origin, leaf.path).toBe("required");
      const wholeProduce = /^Fruit & Vegetables › Fresh (Fruit|Vegetables) › /.test(leaf.path);
      expect(leaf.allergens, leaf.path).toBe(wholeProduce ? null : "required");
    }
  });

  it("keeps stock dates out of the library, and every option attribute is a single choice that varies", async () => {
    const names = await rows<{ name: string }>(`SELECT name FROM public.attribute_definition`);
    expect(names.length).toBeGreaterThanOrEqual(60);
    expect(names.filter((x) => isStockDateName(x.name))).toEqual([]);
    const badOptions = await rows(`
      SELECT key FROM public.attribute_definition WHERE variant_option AND (input_type <> 'single_select' OR NOT varies_by_variant)`);
    expect(badOptions).toEqual([]);
  });

  it("marks at least one attribute internal only", async () => {
    const internal = await rows<{ key: string }>(`SELECT key FROM public.attribute_definition WHERE NOT customer_visible`);
    expect(internal.map((x) => x.key)).toContain("supplier_code");
  });
});
