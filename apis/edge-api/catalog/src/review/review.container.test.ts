import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 067 — product review, against the REAL migrations.
 *
 * ⚠ EVERY GUARANTEE HERE IS SQL: that a decision carrying a stale version is refused, that an
 * approval applies everything or nothing, that a send-back leaves the live product byte-identical,
 * that the audit row and the shop's notification are written in the decision's own transaction. A
 * mocked repository would agree with whatever the author believed the queries do.
 */

const holder = vi.hoisted(() => ({ pool: null as Pool | null, failNext: null as RegExp | null }));

vi.mock("@effy/edge-shared", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("@effy/edge-shared");
  return {
    ...actual,
    presignRead: async (key: string) => `signed:${key}`,
    query: (text: string, params?: unknown[]) => holder.pool!.query(text, params as never[]),
    withTransaction: async (fn: (c: unknown) => unknown) => {
      const client = await holder.pool!.connect();
      // A client whose query can be made to fail on a chosen statement — to kill a decision midway.
      const proxied = {
        query: (text: string, params?: unknown[]) => {
          if (holder.failNext && holder.failNext.test(text)) {
            holder.failNext = null;
            return Promise.reject(new Error("injected failure"));
          }
          return client.query(text, params as never[]);
        },
      };
      try {
        await client.query("BEGIN");
        const out = await fn(proxied);
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

import { migrationSql } from "@effy/edge-shared";

import { ReviewError } from "./errors";
import { approve, item, marginNotSet, oldestWaitingHours, queue, sendBack, setMargin } from "./service";

const RUN = process.env.CONTAINER_TESTS === "1";
const d = RUN ? describe : describe.skip;

const ADMIN = "staff-sub-admin";

let container: StartedPostgreSqlContainer;
let pool: Pool;
let shopId: string;
let storageAttrId: string;

const kindOf = async (p: Promise<unknown>): Promise<string> => {
  try {
    await p;
    return "no-throw";
  } catch (e) {
    return e instanceof ReviewError ? e.kind : `other:${(e as Error).message}`;
  }
};

async function makeShop(code: string, staff = 2): Promise<string> {
  const id = (await pool.query<{ id: string }>(
    `INSERT INTO public.shop (code, name) VALUES ($1, $1 || ' shop') RETURNING id`, [code],
  )).rows[0]!.id;
  for (let i = 0; i < staff; i += 1) {
    await pool.query(
      `INSERT INTO public.shop_staff (cognito_sub, email, name, status, shop_id)
       VALUES ($1, $1 || '@effyshopping.com', 'Op', 'active', $2)`,
      [`${code}-staff-${i}`, id],
    );
  }
  // …and one DISABLED operator, who must never be notified.
  await pool.query(
    `INSERT INTO public.shop_staff (cognito_sub, email, name, status, shop_id)
     VALUES ($1, $1 || '@effyshopping.com', 'Gone', 'disabled', $2)`,
    [`${code}-staff-disabled`, id],
  );
  return id;
}

interface Opts {
  name?: string;
  price?: string;
  was?: string | null;
  approved?: boolean;
  inReview?: boolean;
  shop?: string;
  submittedAgo?: string;
}

async function makeProduct(o: Opts = {}): Promise<string> {
  const approved = o.approved ?? false;
  const inReview = o.inReview ?? !approved;
  const id = (await pool.query<{ id: string }>(
    `INSERT INTO public.product (shop_id, product_type_id, primary_category_id, name, price_amount,
                                 shop_price_amount, compare_at_amount, shop_compare_at_amount,
                                 short_description, created_by, status, approved_at, review_state, submitted_at)
     SELECT $1, (SELECT id FROM public.product_type LIMIT 1), (SELECT id FROM public.category ORDER BY name LIMIT 1),
            $2, $3::numeric, $3::numeric, $4::numeric, $4::numeric, 'A thing', 'seed',
            $5, $6, $7, CASE WHEN $7 = 'in_review' THEN now() - $8::interval ELSE NULL END
     RETURNING id`,
    [
      o.shop ?? shopId, o.name ?? "Sourdough", o.price ?? "10.00", o.was ?? null,
      approved ? "active" : "draft", approved ? new Date() : null,
      !approved && inReview ? "in_review" : "none", o.submittedAgo ?? "0 seconds",
    ],
  )).rows[0]!.id;
  await pool.query(
    `INSERT INTO public.product_media (product_id, storage_key, is_primary, display_order)
     VALUES ($1, 'live/one.jpg', true, 0), ($1, 'live/two.jpg', false, 1)`, [id],
  );
  return id;
}

async function proposeChange(productId: string, proposed: Record<string, unknown>, media?: string[]): Promise<void> {
  const changeId = (await pool.query<{ id: string }>(
    `INSERT INTO public.product_change (product_id, shop_id, proposed, media_changed)
     SELECT id, shop_id, $2::jsonb, $3 FROM public.product WHERE id = $1 RETURNING id`,
    [productId, JSON.stringify(proposed), media !== undefined],
  )).rows[0]!.id;
  for (const [i, key] of (media ?? []).entries()) {
    await pool.query(
      `INSERT INTO public.product_change_media (change_id, storage_key, is_primary, display_order)
       VALUES ($1, $2, $3, $4)`, [changeId, key, i === 0, i],
    );
  }
}

async function live(id: string) {
  const p = (await pool.query(
    `SELECT name, brand, status, price_amount::text, compare_at_amount::text, shop_price_amount::text,
            shop_compare_at_amount::text, margin_kind, margin_value::text, approved_at IS NOT NULL AS approved,
            review_state, review_reason
       FROM public.product WHERE id = $1`, [id],
  )).rows[0];
  const media = (await pool.query(
    `SELECT storage_key, is_primary FROM public.product_media WHERE product_id = $1 ORDER BY display_order, storage_key`, [id],
  )).rows;
  const attrs = (await pool.query(
    `SELECT value_text FROM public.product_attribute_value WHERE product_id = $1`, [id],
  )).rows;
  return { p, media, attrs };
}

const audits = async (id: string) =>
  (await pool.query(`SELECT actor_sub, action, detail FROM admin.audit_log WHERE target_id = $1 ORDER BY created_at`, [id])).rows;

const notifications = async () =>
  (await pool.query(`SELECT recipient_sub, type, payload FROM public.notification_request ORDER BY recipient_sub`)).rows;

d("067 — product review against real PostgreSQL", () => {
  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:16-alpine").start();
    pool = new Pool({ connectionString: container.getConnectionUri() });
    holder.pool = pool;
    await pool.query(migrationSql());
    storageAttrId = (await pool.query<{ id: string }>(
      `SELECT id FROM public.attribute_definition WHERE key = 'storage'`,
    )).rows[0]!.id;
  }, 300_000);

  afterAll(async () => {
    await pool?.end();
    await container?.stop();
  });

  beforeEach(async () => {
    holder.failNext = null;
    await pool.query("DELETE FROM public.notification_request");
    await pool.query("DELETE FROM admin.audit_log");
    await pool.query("DELETE FROM public.product_change");
    await pool.query("DELETE FROM public.product_attribute_value");
    await pool.query("DELETE FROM public.product");
    await pool.query("DELETE FROM public.shop_staff");
    await pool.query("DELETE FROM public.shop");
    shopId = await makeShop("SA");
  });

  // ── The queue ──────────────────────────────────────────────────────────────────────────────────

  it("lists new products and pending changes as ONE queue, longest-waiting first", async () => {
    const older = await makeProduct({ name: "Old loaf", submittedAgo: "3 hours" });
    const newer = await makeProduct({ name: "New loaf", submittedAgo: "1 hour" });
    const liveOne = await makeProduct({ name: "Live milk", approved: true });
    await proposeChange(liveOne, { name: "Live oat milk" });
    await pool.query(`UPDATE public.product_change SET submitted_at = now() - interval '2 hours'`);
    await makeProduct({ name: "Unsubmitted draft", inReview: false });

    const out = await queue({});
    expect(out.items.map((i) => [i.productId, i.kind, i.waitingHours])).toEqual([
      [older, "new_product", 3],
      [liveOne, "change", 2],
      [newer, "new_product", 1],
    ]);
    // For a change the reviewer sees the LIVE name — the one they would recognise.
    expect(out.items[1]!.productName).toBe("Live milk");
    expect(out.items[0]!.shopName).toBe("SA shop");
    expect(out.nextCursor).toBeNull();
  });

  it("filters by shop, by kind and by name", async () => {
    const other = await makeShop("SB");
    const mine = await makeProduct({ name: "Sourdough" });
    const theirs = await makeProduct({ name: "Rye", shop: other });
    const changed = await makeProduct({ name: "Milk", approved: true });
    await proposeChange(changed, { name: "Oat milk" });

    expect((await queue({ shopId: other })).items.map((i) => i.productId)).toEqual([theirs]);
    expect((await queue({ kind: "change" })).items.map((i) => i.productId)).toEqual([changed]);
    expect((await queue({ q: "sour" })).items.map((i) => i.productId)).toEqual([mine]);
  });

  it("pages without repeating or skipping an item", async () => {
    const ids: string[] = [];
    for (let i = 5; i >= 1; i -= 1) ids.push(await makeProduct({ name: `P${i}`, submittedAgo: `${i} hours` }));
    const seen: string[] = [];
    let cursor: string | undefined;
    for (let guard = 0; guard < 10; guard += 1) {
      const page = await queue({ limit: "2", ...(cursor ? { cursor } : {}) });
      seen.push(...page.items.map((i) => i.productId));
      if (!page.nextCursor) break;
      cursor = page.nextCursor;
    }
    expect(seen).toEqual(ids);
  });

  it("reports the age of the oldest waiting item, and nothing when the queue is empty", async () => {
    expect(await oldestWaitingHours()).toBeNull();
    await makeProduct({ submittedAgo: "5 hours" });
    await makeProduct({ submittedAgo: "1 hour" });
    expect(await oldestWaitingHours()).toBe(5);
  });

  // ── A new product ──────────────────────────────────────────────────────────────────────────────

  it("shows a reviewer everything the shop entered, with its images", async () => {
    const id = await makeProduct({ was: "12.00" });
    const out = await item(id);
    expect(out.kind).toBe("new_product");
    expect(out.marginRequired).toBe(true);
    expect(out.changes).toEqual([]);
    expect(out.details.find((r) => r.label === "Name")!.value).toBe("Sourdough");
    expect(out.details.find((r) => r.label === "Shop price")!.value).toBe("10.00");
    expect(out.images.current.map((i) => i.url)).toEqual(["signed:live/one.jpg", "signed:live/two.jpg"]);
    expect(out.images.proposed).toBeNull();
  });

  /** ⚠ FR-028. */
  it("⚠ refuses to approve a new product without a margin", async () => {
    const id = await makeProduct();
    const { version } = await item(id);
    expect(await kindOf(approve(id, { version }, ADMIN))).toBe("validation");
    expect(await kindOf(approve(id, { version, margin: null }, ADMIN))).toBe("validation");
    expect((await live(id)).p.approved).toBe(false);
    expect(await audits(id)).toEqual([]);
  });

  it("approving puts the product on sale at shop price plus margin, in one step", async () => {
    const id = await makeProduct({ was: "12.00" });
    const { version } = await item(id);
    const out = await approve(id, { version, margin: { kind: "percent", value: "20" } }, ADMIN);

    expect(out).toMatchObject({ shopPriceAmount: "10.00", customerPriceAmount: "12.00" });
    expect((await live(id)).p).toMatchObject({
      status: "active", approved: true, review_state: "none",
      shop_price_amount: "10.00", price_amount: "12.00",
      // FR-035 — the "was" price carries the same margin.
      shop_compare_at_amount: "12.00", compare_at_amount: "14.40",
      margin_kind: "percent", margin_value: "20.0000",
    });
  });

  it("zero is a margin: the product goes on sale at the shop's price", async () => {
    const id = await makeProduct();
    const { version } = await item(id);
    await approve(id, { version, margin: { kind: "amount", value: "0" } }, ADMIN);
    expect((await live(id)).p).toMatchObject({ price_amount: "10.00", margin_kind: "amount", margin_value: "0.0000", status: "active" });
  });

  it("refuses a negative margin and writes nothing", async () => {
    const id = await makeProduct();
    const { version } = await item(id);
    expect(await kindOf(approve(id, { version, margin: { kind: "percent", value: "-5" } }, ADMIN))).toBe("validation");
    expect((await live(id)).p.approved).toBe(false);
  });

  /** ⚠ FR-014 — nothing is approved that nobody looked at. */
  it("⚠ refuses a decision on an item the shop edited after the reviewer opened it", async () => {
    const id = await makeProduct();
    const { version } = await item(id);
    await pool.query(`UPDATE public.product SET name = 'Something else', updated_at = now() WHERE id = $1`, [id]);

    expect(await kindOf(approve(id, { version, margin: { kind: "percent", value: "20" } }, ADMIN))).toBe("conflict");
    expect(await kindOf(sendBack(id, { version, reason: "No" }, ADMIN))).toBe("conflict");
    expect((await live(id)).p).toMatchObject({ approved: false, review_state: "in_review" });
  });

  /** ⚠ The 056 trap: a version that had been through a JS Date would never match its own row. */
  it("⚠ accepts the version it handed out, to the microsecond", async () => {
    const id = await makeProduct();
    await pool.query(`UPDATE public.product SET updated_at = '2026-10-04 10:00:00.123456+00' WHERE id = $1`, [id]);
    const { version } = await item(id);
    expect(version).toContain("123456");
    expect(await kindOf(approve(id, { version, margin: { kind: "percent", value: "10" } }, ADMIN))).toBe("no-throw");
  });

  it("the second of two reviewers is told it is already decided", async () => {
    const id = await makeProduct();
    const { version } = await item(id);
    await approve(id, { version, margin: { kind: "percent", value: "20" } }, ADMIN);
    expect(await kindOf(approve(id, { version, margin: { kind: "percent", value: "50" } }, "staff-sub-other"))).toBe("conflict");
    expect((await live(id)).p.price_amount).toBe("12.00");
    expect(await kindOf(item(id))).toBe("not_found");
  });

  // ── Send back ──────────────────────────────────────────────────────────────────────────────────

  it("sending back needs a reason, keeps the product off sale, and shows the shop why", async () => {
    const id = await makeProduct();
    const { version } = await item(id);
    expect(await kindOf(sendBack(id, { version, reason: "   " }, ADMIN))).toBe("validation");
    expect(await kindOf(sendBack(id, { version, reason: "x".repeat(501) }, ADMIN))).toBe("validation");

    await sendBack(id, { version, reason: "The photo is blurry" }, ADMIN);
    expect((await live(id)).p).toMatchObject({
      status: "draft", approved: false, review_state: "sent_back", review_reason: "The photo is blurry",
    });
    expect((await queue({})).items).toEqual([]);
  });

  // ── A change to a live product ─────────────────────────────────────────────────────────────────

  it("shows ONLY what the shop is changing, before and after", async () => {
    const id = await makeProduct({ approved: true });
    await pool.query(
      `INSERT INTO public.product_attribute_value (product_id, attribute_definition_id, value_text) VALUES ($1, $2, 'chilled')`,
      [id, storageAttrId],
    );
    await proposeChange(
      id,
      { name: "Rye", priceAmount: "12.50", attributes: [{ attributeId: storageAttrId, valueText: "frozen" }] },
      ["new/three.jpg", "live/one.jpg"],
    );
    const out = await item(id);

    expect(out.kind).toBe("change");
    expect(out.productName).toBe("Sourdough");
    expect(out.changes).toEqual([
      { field: "name", label: "Name", before: "Sourdough", after: "Rye" },
      { field: "priceAmount", label: "Shop price", before: "10.00", after: "12.50" },
      { field: "attribute:storage", label: "Storage", before: "chilled", after: "frozen" },
    ]);
    expect(out.images.proposed!.map((i) => [i.url, i.isNew, i.isPrimary])).toEqual([
      ["signed:new/three.jpg", true, true],
      ["signed:live/one.jpg", false, false],
    ]);
    expect(out.shopPriceAmount).toBe("12.50");
    expect(out.marginRequired).toBe(true); // the shop price is changing
  });

  /** FR-019. */
  it("approving a change applies every proposed value together, images included", async () => {
    const id = await makeProduct({ approved: true });
    await pool.query(`UPDATE public.product SET margin_kind = 'percent', margin_value = 20, price_amount = 12.00 WHERE id = $1`, [id]);
    await proposeChange(
      id,
      { name: "Rye", brand: "Acme", priceAmount: "20.00", attributes: [{ attributeId: storageAttrId, valueText: "frozen" }] },
      ["new/three.jpg", "live/one.jpg"],
    );
    const { version } = await item(id);
    await approve(id, { version, margin: { kind: "percent", value: "20" } }, ADMIN);

    const after = await live(id);
    expect(after.p).toMatchObject({ name: "Rye", brand: "Acme", shop_price_amount: "20.00", price_amount: "24.00", status: "active" });
    expect(after.media).toEqual([
      { storage_key: "new/three.jpg", is_primary: true },
      { storage_key: "live/one.jpg", is_primary: false },
    ]);
    expect(after.attrs).toEqual([{ value_text: "frozen" }]);
    expect((await pool.query(`SELECT count(*) AS n FROM public.product_change`)).rows[0].n).toBe("0");
  });

  /** ⚠ FR-019, the other half: all of it, or none of it. */
  it("⚠ a failure midway through applying a change leaves NOTHING changed", async () => {
    const id = await makeProduct({ approved: true });
    await proposeChange(id, { name: "Rye" }, ["new/three.jpg"]);
    const before = JSON.stringify(await live(id));
    const { version } = await item(id);

    // The product row has been updated; the image set has been deleted; then the INSERT of the new
    // images fails.
    holder.failNext = /INSERT INTO public\.product_media/;
    await expect(approve(id, { version, margin: { kind: "percent", value: "10" } }, ADMIN)).rejects.toThrow("injected failure");

    expect(JSON.stringify(await live(id))).toBe(before);
    expect((await pool.query(`SELECT count(*) AS n FROM public.product_change`)).rows[0].n).toBe("1");
    expect(await audits(id)).toEqual([]);
    expect(await notifications()).toEqual([]);
  });

  /** ⚠ FR-020 / SC-004. */
  it("⚠ sending a change back leaves the live product byte-identical", async () => {
    const id = await makeProduct({ approved: true });
    await proposeChange(id, { name: "Rye", priceAmount: "99.00" }, ["new/three.jpg"]);
    const before = JSON.stringify(await live(id));
    const { version } = await item(id);

    await sendBack(id, { version, reason: "That name is misleading" }, ADMIN);

    expect(JSON.stringify(await live(id))).toBe(before);
    const change = (await pool.query(`SELECT state, reason FROM public.product_change WHERE product_id = $1`, [id])).rows[0];
    expect(change).toEqual({ state: "sent_back", reason: "That name is misleading" });
    expect((await queue({})).items).toEqual([]);
  });

  it("refuses a change the shop edited while the reviewer had it open", async () => {
    const id = await makeProduct({ approved: true });
    await proposeChange(id, { name: "Rye" });
    const { version } = await item(id);
    await pool.query(
      `UPDATE public.product_change SET proposed = '{"name":"Something else"}'::jsonb, updated_at = now() WHERE product_id = $1`, [id],
    );
    expect(await kindOf(approve(id, { version }, ADMIN))).toBe("conflict");
    expect((await live(id)).p.name).toBe("Sourdough");
  });

  it("refuses a change proposing a category Effy has since retired", async () => {
    const id = await makeProduct({ approved: true });
    const retired = (await pool.query<{ id: string }>(
      `INSERT INTO public.category (key, name, status) VALUES ('gone', 'Gone', 'retired') RETURNING id`,
    )).rows[0]!.id;
    await proposeChange(id, { primaryCategoryId: retired });
    const { version } = await item(id);
    expect(await kindOf(approve(id, { version, margin: { kind: "percent", value: "10" } }, ADMIN))).toBe("validation");
    await pool.query(`DELETE FROM public.product_change`);
    await pool.query(`DELETE FROM public.category WHERE id = $1`, [retired]);
  });

  // ── Margin ─────────────────────────────────────────────────────────────────────────────────────

  /** FR-031. */
  it("a change to the shop price cannot be approved without confirming the margin", async () => {
    const id = await makeProduct({ approved: true });
    await pool.query(`UPDATE public.product SET margin_kind = 'percent', margin_value = 20, price_amount = 12.00 WHERE id = $1`, [id]);
    await proposeChange(id, { priceAmount: "20.00" });
    const { version, marginRequired } = await item(id);
    expect(marginRequired).toBe(true);
    expect(await kindOf(approve(id, { version }, ADMIN))).toBe("validation");
    expect((await live(id)).p.shop_price_amount).toBe("10.00");
  });

  it("a change that leaves the price alone keeps the margin without asking", async () => {
    const id = await makeProduct({ approved: true });
    await pool.query(`UPDATE public.product SET margin_kind = 'amount', margin_value = 2, price_amount = 12.00 WHERE id = $1`, [id]);
    await proposeChange(id, { name: "Rye" });
    const { version, marginRequired, currentMargin } = await item(id);
    expect(marginRequired).toBe(false);
    expect(currentMargin).toEqual({ kind: "amount", value: "2" });
    await approve(id, { version }, ADMIN);
    expect((await live(id)).p).toMatchObject({ name: "Rye", price_amount: "12.00", margin_kind: "amount", margin_value: "2.0000" });
  });

  it("a product that never had a margin needs one before its change is approved", async () => {
    const id = await makeProduct({ approved: true });
    await proposeChange(id, { name: "Rye" });
    const { version, marginRequired } = await item(id);
    expect(marginRequired).toBe(true);
    expect(await kindOf(approve(id, { version }, ADMIN))).toBe("validation");
  });

  /** FR-032. */
  it("setting a live product's margin moves the customer price at once", async () => {
    const id = await makeProduct({ approved: true, was: "12.00" });
    const out = await setMargin(id, { margin: { kind: "amount", value: "2.50" }, expectedCurrent: null }, ADMIN);
    expect(out.customerPriceAmount).toBe("12.50");
    expect((await live(id)).p).toMatchObject({ price_amount: "12.50", compare_at_amount: "14.50", shop_price_amount: "10.00" });

    // A second reviewer working from the old view is refused…
    expect(await kindOf(setMargin(id, { margin: { kind: "percent", value: "50" }, expectedCurrent: null }, ADMIN))).toBe("conflict");
    // …and one who saw the current margin is not.
    await setMargin(id, { margin: { kind: "percent", value: "50" }, expectedCurrent: { kind: "amount", value: "2.5" } }, ADMIN);
    expect((await live(id)).p.price_amount).toBe("15.00");
  });

  it("refuses to set a margin on a product that has never been approved", async () => {
    const id = await makeProduct();
    expect(await kindOf(setMargin(id, { margin: { kind: "percent", value: "10" }, expectedCurrent: null }, ADMIN))).toBe("conflict");
  });

  /** FR-008 / FR-046. */
  it("lists approved products with no margin, and nothing else", async () => {
    const none = await makeProduct({ name: "No margin", approved: true });
    const has = await makeProduct({ name: "Has margin", approved: true });
    await pool.query(`UPDATE public.product SET margin_kind = 'percent', margin_value = 5 WHERE id = $1`, [has]);
    await makeProduct({ name: "Not approved" });
    const out = await marginNotSet({});
    expect(out.items.map((i) => i.productId)).toEqual([none]);
    expect(out.items[0]).toMatchObject({ productName: "No margin", shopPriceAmount: "10.00" });
  });

  // ── The record, and telling the shop ───────────────────────────────────────────────────────────

  /** FR-048 / SC-011. */
  it("writes exactly one audit row per decision, with who, what and the margin before and after", async () => {
    const fresh = await makeProduct();
    await approve(fresh, { version: (await item(fresh)).version, margin: { kind: "percent", value: "20" } }, ADMIN);
    await setMargin(fresh, { margin: { kind: "percent", value: "25" }, expectedCurrent: { kind: "percent", value: "20" } }, ADMIN);

    const rows = await audits(fresh);
    expect(rows.map((r) => [r.actor_sub, r.action])).toEqual([
      [ADMIN, "product.approved"],
      [ADMIN, "product.margin_set"],
    ]);
    expect(rows[0]!.detail).toMatchObject({ marginBefore: null, marginAfter: { kind: "percent", value: "20" }, customerPriceAmount: "12.00" });
    expect(rows[1]!.detail).toMatchObject({
      marginBefore: { kind: "percent", value: "20" }, marginAfter: { kind: "percent", value: "25" },
      customerPriceBefore: "12.00", customerPriceAfter: "12.50",
    });

    const sent = await makeProduct({ name: "Other" });
    await sendBack(sent, { version: (await item(sent)).version, reason: "Blurry" }, ADMIN);
    expect((await audits(sent)).map((r) => r.action)).toEqual(["product.sent_back"]);
  });

  /** ⚠ FR-049 — who decided is never somewhere a shop can read. */
  it("⚠ leaves no trace of the reviewer on anything the shop can see", async () => {
    const id = await makeProduct();
    await sendBack(id, { version: (await item(id)).version, reason: "Blurry" }, ADMIN);
    const row = (await pool.query(`SELECT to_jsonb(p)::text AS all FROM public.product p WHERE id = $1`, [id])).rows[0];
    expect(row.all).not.toContain(ADMIN);
  });

  /** FR-041. */
  it("tells every ACTIVE member of the shop, once, with a routing id and nothing else", async () => {
    const id = await makeProduct();
    await approve(id, { version: (await item(id)).version, margin: { kind: "percent", value: "20" } }, ADMIN);
    expect(await notifications()).toEqual([
      { recipient_sub: "SA-staff-0", type: "shop_product_approved", payload: { entityId: id } },
      { recipient_sub: "SA-staff-1", type: "shop_product_approved", payload: { entityId: id } },
    ]);

    const other = await makeProduct({ name: "Other" });
    await sendBack(other, { version: (await item(other)).version, reason: "Blurry" }, ADMIN);
    const sentBack = (await notifications()).filter((n) => n.type === "shop_product_sent_back");
    expect(sentBack).toHaveLength(2);
    // The reason is on the product's own screen — never in a banner on a shared counter tablet.
    expect(JSON.stringify(sentBack)).not.toContain("Blurry");
  });

  it("a margin change tells the shop nothing", async () => {
    const id = await makeProduct({ approved: true });
    await setMargin(id, { margin: { kind: "percent", value: "10" }, expectedCurrent: null }, ADMIN);
    expect(await notifications()).toEqual([]);
  });
});
