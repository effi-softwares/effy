import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/** 101 (US8) — extra placements and the missing-details list against the real migrations and the seeded tree. */

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
vi.mock("@effy/edge-shared/live", async () => ({
  ...(await vi.importActual<Record<string, unknown>>("@effy/edge-shared/live")),
  announceTaxonomy: vi.fn(async () => undefined),
}));

import { categoryMembershipSql } from "@effy/edge-shared/catalog";
import { migrationSql } from "@effy/edge-shared/testing";

import * as taxonomy from "../taxonomy/service";
import { missingDetails, setPlacements } from "./service";

const RUN = process.env.CONTAINER_TESTS === "1";
const d = RUN ? describe : describe.skip;

let container: StartedPostgreSqlContainer;
let pool: Pool;
const ADMIN = "admin-sub";

const one = async (sql: string, args: unknown[] = []) => (await pool.query<{ id: string }>(sql, args)).rows[0]!.id;
const keyId = (key: string) => one(`SELECT id::text FROM public.category WHERE key = $1`, [key]);

async function refusal(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return "no-throw";
  } catch (e) {
    return (e as { code?: string }).code ?? String(e);
  }
}

async function product(leaf: string, name = "P"): Promise<string> {
  const shop = await one(`INSERT INTO public.shop (code, name) VALUES ($1, 'Corner Shop') RETURNING id::text`, [`S${randomUUID().slice(0, 6)}`]);
  return one(
    `INSERT INTO public.product (shop_id, primary_category_id, name, short_description, created_by, status, approved_at, gst_status, storage, age_restricted)
     VALUES ($1, $2, $3, 'd', 'seed', 'active', now(), 'taxable', 'ambient', false) RETURNING id::text`,
    [shop, leaf, name],
  );
}

/** How many times the product is counted under a category (the storefront's membership rule). */
async function countedUnder(productId: string, categoryKey: string): Promise<number> {
  const r = await pool.query(
    `SELECT count(*)::int AS n FROM public.product p WHERE p.id = $1 AND ${categoryMembershipSql("p", "(SELECT id FROM public.category WHERE key = $2)")}`,
    [productId, categoryKey],
  );
  return r.rows[0].n;
}

d("101 — placements and missing details", () => {
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

  it("refuses a non-leaf, the home leaf and a sixth; replaces the list and audits it", async () => {
    const home = await keyId("bananas");
    const p = await product(home);
    expect(await refusal(setPlacements(p, { categoryIds: [await keyId("dairy-eggs-and-fridge")] }, ADMIN))).toBe("category_not_leaf");
    expect(await refusal(setPlacements(p, { categoryIds: [home] }, ADMIN))).toBe("placement_is_home");
    const six = (await pool.query<{ id: string }>(
      `SELECT category_id::text AS id FROM public.category_resolved WHERE is_leaf AND category_id <> $1 ORDER BY path_names LIMIT 6`, [home],
    )).rows.map((r) => r.id);
    expect(await refusal(setPlacements(p, { categoryIds: six }, ADMIN))).toBe("too_many_placements");

    const lunch = six[2]!;
    await setPlacements(p, { categoryIds: [six[0]!, six[1]!] }, ADMIN);
    const out = await setPlacements(p, { categoryIds: [six[1]!, lunch] }, ADMIN);
    expect(out.categoryIds).toEqual([six[1]!, lunch].sort());
    const stored = (await pool.query(`SELECT category_id::text AS id FROM public.product_placement WHERE product_id = $1 ORDER BY 1`, [p])).rows.map((r) => r.id);
    expect(stored).toEqual(out.categoryIds);
    const audit = await pool.query(`SELECT detail FROM admin.audit_log WHERE action = 'catalog.placements_set' AND target_id = $1 ORDER BY created_at`, [p]);
    expect(audit.rows).toHaveLength(2);
    expect(audit.rows[1].detail.after).toEqual(out.categoryIds);
  });

  it("the storefront counts a placed product under the extra category, once", async () => {
    const p = await product(await keyId("bananas"));
    const extra = await keyId("greek-and-natural-yoghurt");
    await setPlacements(p, { categoryIds: [extra] }, ADMIN);
    expect(await countedUnder(p, "greek-and-natural-yoghurt")).toBe(1);
    expect(await countedUnder(p, "dairy-eggs-and-fridge")).toBe(1);
    expect(await countedUnder(p, "bananas")).toBe(1);
    expect(await countedUnder(p, "laundry-liquid")).toBe(0);
    // Placing it under a sibling of its home inside the same department still counts it once there.
    expect(await countedUnder(p, "fruit-and-vegetables")).toBe(1);
  });

  it("retiring a category deletes its placements", async () => {
    const dept = await taxonomy.create({ parentId: null, name: "Placement Dept" }, ADMIN);
    const leaf = await taxonomy.create({ parentId: dept.id, name: "Placement Leaf" }, ADMIN);
    const p = await product(await keyId("bananas"));
    await setPlacements(p, { categoryIds: [leaf.id] }, ADMIN);
    await taxonomy.setStatus(leaf.id, { status: "retired" }, ADMIN);
    expect((await pool.query(`SELECT count(*)::int AS n FROM public.product_placement WHERE product_id = $1`, [p])).rows[0].n).toBe(0);
  });

  it("lists approved products with a required detail empty, with shop and path, page by page", async () => {
    const leaf = await taxonomy.create({ parentId: null, name: "Missing Leaf" }, ADMIN);
    const material = await one(`SELECT id::text FROM public.attribute_definition WHERE key = 'material'`);
    const ids: string[] = [];
    for (let i = 0; i < 52; i += 1) ids.push(await product(leaf.id, `Missing ${i}`));
    expect((await missingDetails(undefined)).items.filter((x) => ids.includes(x.productId))).toHaveLength(0);
    await taxonomy.attach(leaf.id, material, { level: "required" }, ADMIN);
    const first = await missingDetails(undefined);
    expect(first.items).toHaveLength(50);
    expect(first.items[0]).toMatchObject({ shopName: "Corner Shop", categoryPath: ["Missing Leaf"], missing: ["Material"] });
    const second = await missingDetails(first.nextCursor!);
    const all = [...first.items, ...second.items].map((x) => x.productId);
    expect(new Set(all).size).toBe(all.length);
    expect(ids.every((id) => all.includes(id))).toBe(true);
    expect(await refusal(missingDetails("not-a-cursor"))).toBe("invalid_cursor");
  });
});
