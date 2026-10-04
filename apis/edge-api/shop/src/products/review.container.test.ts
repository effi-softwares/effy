import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 067 — the shop's half of product review, against the REAL migrations.
 *
 * ⚠ THE UNIT TESTS MOCK THE REPOSITORY AND THE CHANGE MODULE, so they prove the service asks for
 * the right thing and nothing about whether the SQL does it. Everything that matters here is SQL:
 * that an approved product's live rows are byte-identical after a shop edits it, that a proposal
 * which no longer differs is deleted, that one product has one open change, and that the table
 * itself refuses a never-approved product going on sale.
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
// Presigning needs AWS; the key itself is enough to assert on.
vi.mock("./media", () => ({
  presignRead: async (key: string) => `signed:${key}`,
  presignUpload: async () => ({ uploadUrl: "u", storageKey: "k" }),
}));

import { migrationSql } from "@effy/edge-shared";

import {
  changeStatus,
  getProduct,
  listProducts,
  patchMedia,
  registerMedia,
  removeMedia,
  setSections,
  submitForReview,
  updateProduct,
  withdraw,
} from "./service";
import { isProductError } from "./types";

const RUN = process.env.CONTAINER_TESTS === "1";
const d = RUN ? describe : describe.skip;

let container: StartedPostgreSqlContainer;
let pool: Pool;
let shopId: string;
let otherShopId: string;
let storageAttrId: string;

const kindOf = async (p: Promise<unknown>): Promise<string> => {
  try {
    await p;
    return "no-throw";
  } catch (e) {
    return isProductError(e) ? e.kind : `other:${(e as Error).message}`;
  }
};

async function makeShop(code: string): Promise<string> {
  return (await pool.query<{ id: string }>(
    `INSERT INTO public.shop (code, name) VALUES ($1, $1 || ' shop') RETURNING id`, [code],
  )).rows[0]!.id;
}

/** A product as the shop wizard leaves it. `approved` makes it one Effy has already passed. */
async function makeProduct(opts: { approved?: boolean; image?: boolean; shop?: string } = {}): Promise<string> {
  const approved = opts.approved ?? false;
  const id = (await pool.query<{ id: string }>(
    `INSERT INTO public.product (shop_id, product_type_id, primary_category_id, name, price_amount,
                                 shop_price_amount, short_description, created_by, status, approved_at)
     SELECT $1, (SELECT id FROM public.product_type WHERE key = 'general' LIMIT 1),
            (SELECT id FROM public.category LIMIT 1), 'Sourdough', 10.00, 10.00, 'A loaf', 'seed',
            $2, $3 RETURNING id`,
    [opts.shop ?? shopId, approved ? "active" : "draft", approved ? new Date() : null],
  )).rows[0]!.id;
  if (opts.image ?? true) {
    await pool.query(
      `INSERT INTO public.product_media (product_id, storage_key, is_primary, display_order)
       VALUES ($1, 'live/one.jpg', true, 0), ($1, 'live/two.jpg', false, 1)`,
      [id],
    );
  }
  return id;
}

/** Everything a customer could be shown, as one comparable value. */
async function liveSnapshot(id: string): Promise<string> {
  const p = (await pool.query(
    `SELECT name, sku, gtin, brand, price_amount::text, compare_at_amount::text, shop_price_amount::text,
            short_description, long_description, primary_category_id, product_type_id, weight_grams, status
       FROM public.product WHERE id = $1`, [id],
  )).rows[0];
  const a = (await pool.query(
    `SELECT attribute_definition_id, value_text, value_number::text, value_boolean, value_options
       FROM public.product_attribute_value WHERE product_id = $1 ORDER BY attribute_definition_id`, [id],
  )).rows;
  const m = (await pool.query(
    `SELECT storage_key, is_primary, display_order, alt_text
       FROM public.product_media WHERE product_id = $1 ORDER BY display_order, storage_key`, [id],
  )).rows;
  return JSON.stringify({ p, a, m });
}

const changeCount = async (id: string) =>
  Number((await pool.query(`SELECT count(*) AS n FROM public.product_change WHERE product_id = $1`, [id])).rows[0].n);

d("067 — shop product review against real PostgreSQL", () => {
  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:16-alpine").start();
    pool = new Pool({ connectionString: container.getConnectionUri() });
    holder.pool = pool;
    await pool.query(migrationSql());
    // A product type with NO mandatory attributes, so readiness is about the image alone here.
    await pool.query(
      `INSERT INTO public.product_type (key, name, description) VALUES ('general', 'General', 'Test type')
       ON CONFLICT DO NOTHING`,
    );
    storageAttrId = (await pool.query<{ id: string }>(
      `SELECT id FROM public.attribute_definition WHERE key = 'storage'`,
    )).rows[0]!.id;
    // …but the storage attribute is ASSIGNED to it (optional), so a shop may set and change it.
    await pool.query(
      `INSERT INTO public.product_type_attribute (product_type_id, attribute_definition_id, is_mandatory, display_order)
       SELECT pt.id, $1, false, 1 FROM public.product_type pt WHERE pt.key = 'general'
       ON CONFLICT DO NOTHING`,
      [storageAttrId],
    );
  }, 300_000);

  afterAll(async () => {
    await pool?.end();
    await container?.stop();
  });

  beforeEach(async () => {
    await pool.query("DELETE FROM public.product_change");
    await pool.query("DELETE FROM public.product_attribute_value");
    await pool.query("DELETE FROM public.product");
    await pool.query("DELETE FROM public.shop");
    shopId = await makeShop("SA");
    otherShopId = await makeShop("SB");
  });

  // ── US1 — a new product ─────────────────────────────────────────────────────────────────────────

  it("a submitted product is in review, still a draft, and reads so to the shop", async () => {
    const id = await makeProduct();
    const out = await submitForReview(shopId, id);
    expect(out.reviewState).toBe("in_review");
    expect(out.status).toBe("draft");
    const row = (await pool.query(`SELECT review_state, submitted_at FROM public.product WHERE id = $1`, [id])).rows[0];
    expect(row.review_state).toBe("in_review");
    expect(row.submitted_at).not.toBeNull();
  });

  it("refuses to submit a product with no main image", async () => {
    const id = await makeProduct({ image: false });
    expect(await kindOf(submitForReview(shopId, id))).toBe("validation");
    expect((await pool.query(`SELECT review_state FROM public.product WHERE id = $1`, [id])).rows[0].review_state).toBe("none");
  });

  /** ⚠ FR-001, at all three layers. */
  it("⚠ a shop cannot put a never-approved product on sale — by the service, the query, or the table", async () => {
    const id = await makeProduct();
    expect(await kindOf(changeStatus(shopId, id, { status: "active" }))).toBe("conflict");

    const { changeStatus: repoChangeStatus } = await import("./repository");
    expect(await repoChangeStatus(shopId, id, "active")).toBe(false);

    await expect(
      pool.query(`UPDATE public.product SET status = 'active' WHERE id = $1`, [id]),
    ).rejects.toThrow(/product_active_requires_approval_check/);
    expect((await pool.query(`SELECT status FROM public.product WHERE id = $1`, [id])).rows[0].status).toBe("draft");
  });

  it("withdraw takes a submission back out of the queue", async () => {
    const id = await makeProduct();
    await submitForReview(shopId, id);
    const out = await withdraw(shopId, id);
    expect(out.reviewState).toBe("draft");
    expect(await kindOf(withdraw(shopId, id))).toBe("conflict");
  });

  it("another shop cannot submit, withdraw or read it", async () => {
    const id = await makeProduct();
    expect(await kindOf(submitForReview(otherShopId, id))).toBe("not_found");
    expect(await kindOf(withdraw(otherShopId, id))).toBe("not_found");
    expect(await kindOf(getProduct(otherShopId, id))).toBe("not_found");
  });

  it("a draft is still edited in place, and both prices follow what the shop typed", async () => {
    const id = await makeProduct();
    const before = await getProduct(shopId, id);
    await updateProduct(shopId, id, { expectedUpdatedAt: before.updatedAt, name: "Rye", priceAmount: "12.50" });
    const row = (await pool.query(
      `SELECT name, price_amount::text, shop_price_amount::text FROM public.product WHERE id = $1`, [id],
    )).rows[0];
    expect(row).toEqual({ name: "Rye", price_amount: "12.50", shop_price_amount: "12.50" });
    expect(await changeCount(id)).toBe(0);
  });

  it("a sent-back product shows Effy's reason until it is resubmitted", async () => {
    const id = await makeProduct();
    await pool.query(
      `UPDATE public.product SET review_state = 'sent_back', review_reason = 'Photo is blurry' WHERE id = $1`, [id],
    );
    const shown = await getProduct(shopId, id);
    expect(shown.reviewState).toBe("sent_back");
    expect(shown.reviewReason).toBe("Photo is blurry");
    const again = await submitForReview(shopId, id);
    expect(again.reviewState).toBe("in_review");
    expect(again.reviewReason).toBeNull();
  });

  it("the list shows each product's state and can filter by it", async () => {
    const draft = await makeProduct();
    const waiting = await makeProduct();
    await submitForReview(shopId, waiting);
    const live = await makeProduct({ approved: true });

    const all = await listProducts(shopId, {});
    const byId = Object.fromEntries(all.items.map((i) => [i.id, i.reviewState]));
    expect(byId).toEqual({ [draft]: "draft", [waiting]: "in_review", [live]: "live" });

    const filtered = await listProducts(shopId, { reviewState: "in_review" });
    expect(filtered.items.map((i) => i.id)).toEqual([waiting]);
    expect(filtered.total).toBe(1);
  });

  /** ⚠ FR-014 — the reviewer's version must move when the PHOTO does, not only when a field does. */
  it("⚠ swapping the image of a product in review moves its version", async () => {
    const id = await makeProduct();
    await submitForReview(shopId, id);
    const version = async () =>
      (await pool.query<{ v: string }>(`SELECT updated_at::text AS v FROM public.product WHERE id = $1`, [id])).rows[0]!.v;
    const seen = await version();
    await registerMedia(shopId, id, { storageKey: "new/swapped.jpg", isPrimary: true });
    expect(await version()).not.toBe(seen);
  });

  // ── US3 — a change to an approved product ───────────────────────────────────────────────────────

  /** ⚠ FR-015 / FR-016 / SC-003. */
  it("⚠ editing an approved product leaves every live row byte-identical and creates ONE change", async () => {
    const id = await makeProduct({ approved: true });
    await pool.query(
      `INSERT INTO public.product_attribute_value (product_id, attribute_definition_id, value_text)
       VALUES ($1, $2, 'chilled')`, [id, storageAttrId],
    );
    const before = await liveSnapshot(id);

    await updateProduct(shopId, id, { name: "Rye", priceAmount: "12.50" });
    await updateProduct(shopId, id, { brand: "Acme", attributes: [{ attributeId: storageAttrId, valueText: "frozen" }] });
    await registerMedia(shopId, id, { storageKey: "new/three.jpg", isPrimary: true });

    expect(await liveSnapshot(id)).toBe(before);
    expect(await changeCount(id)).toBe(1);

    const shown = await getProduct(shopId, id);
    expect(shown.name).toBe("Sourdough"); // the shop still sees what customers see
    expect(shown.reviewState).toBe("live_change_pending");
    expect(shown.pendingChange!.proposed).toMatchObject({ name: "Rye", priceAmount: "12.50", brand: "Acme" });
    expect(shown.pendingChange!.proposed.attributes).toHaveLength(1);
    expect(shown.pendingChange!.proposed.attributes![0]).toMatchObject({ attributeId: storageAttrId, valueText: "frozen" });
    expect(shown.pendingChange!.media!.map((m) => [m.storageKey, m.isPrimary])).toEqual([
      ["new/three.jpg", true],
      ["live/one.jpg", false],
      ["live/two.jpg", false],
    ]);
  });

  /** FR-022 — changing it back proposes nothing, and leaves nothing in Effy's queue. */
  it("a proposal that no longer differs from the live product is deleted", async () => {
    const id = await makeProduct({ approved: true });
    await updateProduct(shopId, id, { name: "Rye" });
    expect(await changeCount(id)).toBe(1);
    await updateProduct(shopId, id, { name: "Sourdough" });
    expect(await changeCount(id)).toBe(0);
    expect((await getProduct(shopId, id)).reviewState).toBe("live");
  });

  it("an image change that is undone leaves no change behind", async () => {
    const id = await makeProduct({ approved: true });
    const added = await registerMedia(shopId, id, { storageKey: "new/three.jpg", isPrimary: false, displayOrder: 2 });
    expect(await changeCount(id)).toBe(1);
    await removeMedia(shopId, id, added.id);
    expect(await changeCount(id)).toBe(0);
  });

  it("an image can be addressed by its LIVE id before the client has refetched", async () => {
    const id = await makeProduct({ approved: true });
    const liveTwo = (await pool.query<{ id: string }>(
      `SELECT id FROM public.product_media WHERE product_id = $1 AND storage_key = 'live/two.jpg'`, [id],
    )).rows[0]!.id;
    const before = await liveSnapshot(id);

    const patched = await patchMedia(shopId, id, liveTwo, { isPrimary: true });
    expect(patched.storageKey).toBe("live/two.jpg");
    expect(patched.isPrimary).toBe(true);
    expect(await liveSnapshot(id)).toBe(before);
    const shown = await getProduct(shopId, id);
    expect(shown.media.find((m) => m.isPrimary)!.storageKey).toBe("live/one.jpg"); // live: unchanged
    expect(shown.pendingChange!.media!.find((m) => m.isPrimary)!.storageKey).toBe("live/two.jpg");
  });

  it("withdraw discards the pending change and the live product never moved", async () => {
    const id = await makeProduct({ approved: true });
    const before = await liveSnapshot(id);
    await updateProduct(shopId, id, { name: "Rye" });
    await registerMedia(shopId, id, { storageKey: "new/three.jpg", isPrimary: false, displayOrder: 2 });
    const out = await withdraw(shopId, id);
    expect(out.pendingChange).toBeNull();
    expect(out.reviewState).toBe("live");
    expect(await changeCount(id)).toBe(0);
    expect(await liveSnapshot(id)).toBe(before);
  });

  it("editing a change Effy sent back returns it to the queue as a fresh submission", async () => {
    const id = await makeProduct({ approved: true });
    await updateProduct(shopId, id, { name: "Rye" });
    await pool.query(
      `UPDATE public.product_change SET state = 'sent_back', reason = 'Name is misleading',
              submitted_at = now() - interval '2 days' WHERE product_id = $1`, [id],
    );
    const sentBack = await getProduct(shopId, id);
    expect(sentBack.reviewState).toBe("live_change_sent_back");
    expect(sentBack.reviewReason).toBe("Name is misleading");

    await updateProduct(shopId, id, { name: "Dark rye" });
    const row = (await pool.query(
      `SELECT state, reason, submitted_at > now() - interval '1 minute' AS fresh
         FROM public.product_change WHERE product_id = $1`, [id],
    )).rows[0];
    expect(row).toEqual({ state: "in_review", reason: null, fresh: true });
  });

  it("the customer price a shop is shown is the live one, beside its own", async () => {
    const id = await makeProduct({ approved: true });
    await pool.query(
      `UPDATE public.product SET price_amount = 12.00, margin_kind = 'percent', margin_value = 20 WHERE id = $1`, [id],
    );
    const shown = await getProduct(shopId, id);
    expect(shown.priceAmount).toBe("10.00");
    expect(shown.customerPriceAmount).toBe("12.00");
    // ⚠ FR-039 — the margin itself is nowhere on what a shop receives.
    expect(JSON.stringify(shown)).not.toMatch(/margin/i);
  });

  // ── US4 — what never waits ──────────────────────────────────────────────────────────────────────

  /** FR-024 / FR-025 / FR-026. */
  it("⚠ off sale and back on sale are immediate and never touch the pending change", async () => {
    const id = await makeProduct({ approved: true });
    await updateProduct(shopId, id, { name: "Rye" });
    const change = async () =>
      JSON.stringify((await pool.query(`SELECT proposed, state, updated_at::text FROM public.product_change WHERE product_id = $1`, [id])).rows);
    const before = await change();

    expect((await changeStatus(shopId, id, { status: "unavailable" })).status).toBe("unavailable");
    expect((await changeStatus(shopId, id, { status: "active" })).status).toBe("active");
    expect((await changeStatus(shopId, id, { status: "archived" })).status).toBe("archived");

    expect(await change()).toBe(before);
    expect(await changeCount(id)).toBe(1);
  });

  it("organising a product into sections is the shop's own business and needs no review", async () => {
    const id = await makeProduct({ approved: true });
    const section = (await pool.query<{ id: string }>(
      `INSERT INTO public.shop_section (shop_id, name) VALUES ($1, 'Bakery') RETURNING id`, [shopId],
    )).rows[0]!.id;
    const out = await setSections(shopId, id, { sectionIds: [section] });
    expect(out.sections).toEqual(["Bakery"]);
    expect(await changeCount(id)).toBe(0);
  });
});
