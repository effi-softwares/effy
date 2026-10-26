import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/**
 * 101 — the back-office taxonomy against the real migrations and the seeded tree: every refusal of the one
 * writer, the audit row each write leaves, and the derived tables rebuilt in the same transaction.
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
vi.mock("@effy/edge-shared/live", async () => ({
  ...(await vi.importActual<Record<string, unknown>>("@effy/edge-shared/live")),
  announceTaxonomy: vi.fn(async () => undefined),
}));

import { migrationSql } from "@effy/edge-shared/testing";

import * as svc from "./service";

const RUN = process.env.CONTAINER_TESTS === "1";
const d = RUN ? describe : describe.skip;

let container: StartedPostgreSqlContainer;
let pool: Pool;
const ADMIN = "admin-sub";

const one = async (sql: string, args: unknown[] = []) => (await pool.query<{ id: string }>(sql, args)).rows[0]!.id;
const keyId = (key: string) => one(`SELECT id::text FROM public.category WHERE key = $1`, [key]);
const attrId = (key: string) => one(`SELECT id::text FROM public.attribute_definition WHERE key = $1`, [key]);

async function refusal(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return "no-throw";
  } catch (e) {
    return (e as { code?: string }).code ?? String(e);
  }
}

async function product(leaf: string, status = "active"): Promise<string> {
  const shop = await one(`INSERT INTO public.shop (code, name) VALUES ($1, 'Shop') RETURNING id::text`, [`S${randomUUID().slice(0, 6)}`]);
  return one(
    `INSERT INTO public.product (shop_id, primary_category_id, name, short_description, created_by, status, approved_at, gst_status, storage, age_restricted)
     VALUES ($1, $2, 'P', 'd', 'seed', $3, now(), 'taxable', 'ambient', false) RETURNING id::text`,
    [shop, leaf, status],
  );
}

const audits = async (action: string) =>
  Number((await pool.query(`SELECT count(*)::int AS n FROM admin.audit_log WHERE action = $1`, [action])).rows[0].n);

d("101 — the taxonomy writer", () => {
  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:16-alpine").start();
    pool = new Pool({ connectionString: container.getConnectionUri() });
    holder.pool = pool;
    process.env.MEDIA_PUBLIC_BASE_URL = "https://media.test";
    await pool.query(migrationSql());
  }, 300_000);

  afterAll(async () => {
    await pool?.end();
    await container?.stop();
  });

  it("builds a five-level branch and refuses a sixth", async () => {
    let parent: string | null = null;
    const ids: string[] = [];
    for (const name of ["T One", "T Two", "T Three", "T Four", "T Five"]) {
      const c = await svc.create({ parentId: parent, name }, ADMIN);
      ids.push(c.id);
      parent = c.id;
    }
    const form = await pool.query(`SELECT depth FROM public.category_resolved WHERE category_id = $1`, [parent]);
    expect(form.rows[0].depth).toBe(5);
    expect(await refusal(svc.create({ parentId: parent, name: "T Six" }, ADMIN))).toBe("category_too_deep");
    expect(await audits("taxonomy.category_created")).toBe(5);
    // A branch moved under a level-3 category would put its deepest below five.
    expect(await refusal(svc.move(ids[1]!, { parentId: ids[0], position: 0 }, ADMIN))).toBe("no-throw");
    expect(await refusal(svc.move(ids[0]!, { parentId: await keyId("bananas"), position: 0 }, ADMIN))).toBe("category_too_deep");
  });

  it("refuses a cycle and a duplicate sibling name", async () => {
    const top = await svc.create({ parentId: null, name: "Cycle Top" }, ADMIN);
    const child = await svc.create({ parentId: top.id, name: "Cycle Child" }, ADMIN);
    expect(await refusal(svc.move(top.id, { parentId: child.id, position: 0 }, ADMIN))).toBe("category_cycle");
    expect(await refusal(svc.create({ parentId: top.id, name: "cycle child" }, ADMIN))).toBe("category_sibling_name_taken");
  });

  it("adds a sub-category to a leaf with products only when they move with it", async () => {
    const leaf = await svc.create({ parentId: null, name: "Has Products" }, ADMIN);
    const p = await product(leaf.id);
    expect(await refusal(svc.create({ parentId: leaf.id, name: "Child" }, ADMIN))).toBe("category_has_products");
    const child = await svc.create({ parentId: leaf.id, name: "Child", moveProductsToSelf: true }, ADMIN);
    expect((await pool.query(`SELECT primary_category_id::text AS c FROM public.product WHERE id = $1`, [p])).rows[0].c).toBe(child.id);
    const resolved = await pool.query(`SELECT is_leaf FROM public.category_resolved WHERE category_id = $1`, [leaf.id]);
    expect(resolved.rows[0].is_leaf).toBe(false);
    // Moving another category under a leaf that holds products is refused.
    const other = await svc.create({ parentId: null, name: "Elsewhere" }, ADMIN);
    expect(await refusal(svc.move(other.id, { parentId: child.id, position: 0 }, ADMIN))).toBe("category_has_products");
  });

  it("retires bottom-up, refusing a category in use or with children, and restores under an active parent", async () => {
    const top = await svc.create({ parentId: null, name: "Retire Top" }, ADMIN);
    const leaf = await svc.create({ parentId: top.id, name: "Retire Leaf" }, ADMIN);
    expect(await refusal(svc.setStatus(top.id, { status: "retired" }, ADMIN))).toBe("category_has_children");
    const p = await product(leaf.id);
    expect(await refusal(svc.setStatus(leaf.id, { status: "retired" }, ADMIN))).toBe("category_in_use");
    await pool.query(`UPDATE public.product SET status = 'archived' WHERE id = $1`, [p]);
    const placedProduct = await product(await keyId("bananas"));
    await pool.query(`INSERT INTO public.product_placement (product_id, category_id, created_by) VALUES ($1, $2, 'x')`, [placedProduct, leaf.id]);
    await svc.setStatus(leaf.id, { status: "retired" }, ADMIN);
    expect((await pool.query(`SELECT count(*)::int AS n FROM public.product_placement WHERE category_id = $1`, [leaf.id])).rows[0].n).toBe(0);
    await svc.setStatus(top.id, { status: "retired" }, ADMIN);
    expect(await refusal(svc.setStatus(leaf.id, { status: "active" }, ADMIN))).toBe("parent_retired");
    expect(await refusal(svc.create({ parentId: top.id, name: "Under retired" }, ADMIN))).toBe("parent_retired");
    await svc.setStatus(top.id, { status: "active" }, ADMIN);
    await svc.setStatus(leaf.id, { status: "active" }, ADMIN);
  });

  it("restoring under a parent that now holds products needs their consent", async () => {
    const top = await svc.create({ parentId: null, name: "Restore Top" }, ADMIN);
    const leaf = await svc.create({ parentId: top.id, name: "Restore Leaf" }, ADMIN);
    await svc.setStatus(leaf.id, { status: "retired" }, ADMIN);
    const p = await product(top.id);
    expect(await refusal(svc.setStatus(leaf.id, { status: "active" }, ADMIN))).toBe("category_has_products");
    await svc.setStatus(leaf.id, { status: "active", moveProductsToSelf: true }, ADMIN);
    expect((await pool.query(`SELECT primary_category_id::text AS c FROM public.product WHERE id = $1`, [p])).rows[0].c).toBe(leaf.id);
  });

  it("sets defaults, synonyms, an icon and a picture key, refusing what does not fit", async () => {
    const c = await svc.create({ parentId: null, name: "Defaults Dept", defaults: { storage: "frozen" } }, ADMIN);
    const out = await svc.update(c.id, { synonyms: ["Ice", "ice", "frozen goods"], icon: "snowflake", defaults: { gstStatus: "gst_free" } }, ADMIN);
    expect(out).toMatchObject({ synonyms: ["ice", "frozen goods"], icon: "snowflake", resolved: { storage: "frozen", gstStatus: "gst_free", ageRestricted: null } });
    expect(await refusal(svc.update(c.id, { icon: "rocket" }, ADMIN))).toBe("invalid_icon");
    expect(await refusal(svc.update(c.id, { imageKey: "products/x.jpg" }, ADMIN))).toBe("invalid_image");
    expect((await svc.update(c.id, { imageKey: `categories/${c.id}/a.webp` }, ADMIN)).imageKey).toBe(`categories/${c.id}/a.webp`);
  });

  it("US2 — defines attributes once, refusing bad shapes, stock dates and duplicate names", async () => {
    const a = await svc.createAttr({
      name: "Test Weight", inputType: "number", unitFamily: "mass", units: ["kg", "g"], filterable: true,
      customerVisible: true, variesByVariant: false, variantOption: false,
    }, ADMIN);
    expect(a).toMatchObject({ key: "test_weight", units: ["kg", "g"], usage: { categories: 0, products: 0 } });
    expect(await refusal(svc.createAttr({ name: "test weight", inputType: "short_text", filterable: false, customerVisible: true, variesByVariant: false, variantOption: false }, ADMIN))).toBe("attribute_name_taken");
    expect(await refusal(svc.createAttr({ name: "Expiry date", inputType: "date", filterable: false, customerVisible: true, variesByVariant: false, variantOption: false }, ADMIN))).toBe("attribute_is_stock_date");
    expect(await refusal(svc.createAttr({ name: "Bad", inputType: "short_text", filterable: true, customerVisible: true, variesByVariant: false, variantOption: false }, ADMIN))).toBe("invalid_attribute");
    expect(await refusal(svc.createAttr({ name: "No Values", inputType: "single_select", filterable: false, customerVisible: true, variesByVariant: false, variantOption: false }, ADMIN))).toBe("invalid_attribute");
    expect(await refusal(svc.createAttr({ name: "Wrong Unit", inputType: "number", unitFamily: "mass", units: ["L"], filterable: false, customerVisible: true, variesByVariant: false, variantOption: false }, ADMIN))).toBe("invalid_attribute");
    expect(await audits("taxonomy.attribute_created")).toBeGreaterThanOrEqual(1);
  });

  it("US2 — a used attribute keeps its type and values; a renamed value rewrites the label orders read", async () => {
    const flavour = await svc.createAttr({
      name: "Test Flavour", inputType: "single_select", filterable: true, customerVisible: true, variesByVariant: true, variantOption: true,
      values: [{ label: "Plain" }, { label: "Mango" }],
    }, ADMIN);
    const plain = flavour.values.find((v) => v.label === "Plain")!.id;
    const p = await product(await keyId("bananas"));
    await pool.query(`INSERT INTO public.product_attribute_value (product_id, attribute_definition_id, allowed_value_ids) VALUES ($1, $2, ARRAY[$3]::uuid[])`, [p, flavour.id, plain]);
    const option = await one(`INSERT INTO public.product_option (product_id, "position", kind, attribute_id) VALUES ($1, 1, 'attribute', $2) RETURNING id::text`, [p, flavour.id]);
    await pool.query(`INSERT INTO public.product_option_value (option_id, value, "position", allowed_value_id) VALUES ($1, 'Plain', 0, $2)`, [option, plain]);

    expect(await refusal(svc.updateAttr(flavour.id, { inputType: "multi_select" }, ADMIN))).toBe("attribute_in_use");
    expect(await refusal(svc.updateAttr(flavour.id, { values: [{ id: flavour.values.find((v) => v.label === "Mango")!.id, label: "Mango" }] }, ADMIN))).toBe("value_in_use");
    expect(await refusal(svc.setAttrStatus(flavour.id, { status: "retired" }, ADMIN))).toBe("attribute_in_use");

    await svc.updateAttr(flavour.id, { values: [{ id: plain, label: "Natural" }, { id: flavour.values.find((v) => v.label === "Mango")!.id, label: "Mango", status: "retired" }] }, ADMIN);
    expect((await pool.query(`SELECT value FROM public.product_option_value WHERE allowed_value_id = $1`, [plain])).rows[0].value).toBe("Natural");
    const after = await svc.attribute(flavour.id);
    expect(after.values.map((v) => [v.label, v.status, v.usage])).toEqual([["Natural", "active", 1], ["Mango", "retired", 0]]);
  });

  it("US2 — attaches, tightens and hides down the tree, never loosening, with sources in the preview", async () => {
    const dept = await svc.create({ parentId: null, name: "Attach Dept" }, ADMIN);
    const aisle = await svc.create({ parentId: dept.id, name: "Attach Aisle" }, ADMIN);
    const leaf = await svc.create({ parentId: aisle.id, name: "Attach Leaf" }, ADMIN);
    const colour = await attrId("colour");
    const scent = await attrId("scent");
    expect(await refusal(svc.attach(aisle.id, scent, { hidden: true }, ADMIN))).toBe("nothing_to_hide");
    await svc.attach(dept.id, colour, { level: "recommended", section: "Looks", position: 5 }, ADMIN);
    await svc.attach(dept.id, scent, { level: "optional" }, ADMIN);
    expect(await refusal(svc.attach(aisle.id, colour, { level: "optional" }, ADMIN))).toBe("attachment_loosens");
    await svc.attach(aisle.id, colour, { level: "required" }, ADMIN);
    await svc.attach(aisle.id, scent, { hidden: true }, ADMIN);

    const form = await svc.form(leaf.id);
    const rows = form.sections.flatMap((s) => s.rows);
    expect(rows.map((r) => [r.key, r.level, r.section, r.sourceCategoryName])).toEqual([["colour", "required", "Looks", "Attach Aisle"]]);
    expect((await svc.form(aisle.id)).own!.map((o) => [o.name, o.level, o.hidden])).toEqual([["Colour", "required", false], ["Scent", null, true]]);
    expect(await audits("taxonomy.attachment_set")).toBe(4);

    await svc.detach(aisle.id, scent, ADMIN);
    expect((await svc.form(leaf.id)).sections.flatMap((s) => s.rows).map((r) => r.key).sort()).toEqual(["colour", "scent"]);
    expect(await refusal(svc.detach(aisle.id, scent, ADMIN))).toBe("attachment_not_found");
  });

  it("US2 — a new requirement leaves products on sale and lists them as missing it", async () => {
    const leaf = await svc.create({ parentId: null, name: "Requirement Leaf" }, ADMIN);
    const p = await product(leaf.id);
    await svc.attach(leaf.id, await attrId("material"), { level: "required" }, ADMIN);
    const status = (await pool.query(`SELECT status FROM public.product WHERE id = $1`, [p])).rows[0].status;
    expect(status).toBe("active");
    const missing = await pool.query(`SELECT attribute_name FROM public.product_missing_required($1)`, [p]);
    expect(missing.rows.map((r) => r.attribute_name)).toEqual(["Material"]);
  });
});
