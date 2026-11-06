import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { migrationSql } from "../testing/migrations";

import { candidatesFor, groupPromotions, hiddenBecause, loadPromotions } from "./candidates";
import { melbourneContext, pricePromotions, type Basket } from "./engine";
import { loadLiveValues } from "./live-values";

/** 108: an information banner is shown like an offer and never touches money. */
const RUN = process.env.CONTAINER_TESTS === "1";
const d = RUN ? describe : describe.skip;

let container: StartedPostgreSqlContainer;
let pool: Pool;
let seq = 0;

const one = async <T>(sql: string, args: unknown[] = []) => (await pool.query(sql, args)).rows[0] as T;

async function insert(cols: Record<string, unknown>): Promise<string> {
  const keys = Object.keys(cols);
  return (
    await one<{ id: string }>(
      `INSERT INTO public.promotion (${keys.join(", ")}) VALUES (${keys.map((_, i) => `$${i + 1}`).join(", ")}) RETURNING id::text AS id`,
      Object.values(cols),
    )
  ).id;
}

const published = () => new Date(Date.now() - 60_000);
const banner = (extra: Record<string, unknown> = {}) =>
  insert({ name: `B${++seq}`, kind: "banner", link_kind: "search", headline: "Shop everything with Effy", published_at: published(), created_by: "staff-1", ...extra });
const offer = (extra: Record<string, unknown> = {}) =>
  insert({
    name: `O${++seq}`, kind: "cart", trigger: "automatic", value_type: "amount", amount_off: 5, applies_to: "cart",
    published_at: published(), created_by: "staff-1", ...extra,
  });

async function place(groupKey: string, promotionId: string, position: number) {
  await pool.query(
    `INSERT INTO public.promotion_group_member (group_id, promotion_id, position)
     SELECT id, $2, $3 FROM public.promotion_group WHERE key = $1`,
    [groupKey, promotionId, position],
  );
}

const basket: Basket = {
  lines: [{ lineId: "l1", productId: "00000000-0000-0000-0000-000000000001", categoryIds: [], brand: null, unitCents: 4000, quantity: 2 }],
  deliveryType: "effy",
  deliveryFeeCents: 900,
};

async function priced() {
  const now = new Date();
  const set = await candidatesFor(pool, { customerId: null, enteredCodeId: null, now });
  return { ids: set.candidates.map((c) => c.id).sort(), outcome: pricePromotions(basket, set.candidates, melbourneContext(now)) };
}

d("108 — information banners", () => {
  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:16-alpine").start();
    pool = new Pool({ connectionString: container.getConnectionUri(), max: 8 });
    await pool.query(migrationSql());
    await pool.query(
      `INSERT INTO public.delivery_fee_plan (name, kind, is_active, base_amount, floor_amount, cap_amount, free_over_amount, created_by)
       VALUES ('Test plan', 'effy', true, 6, 6, 25, 150, 'test')`,
    );
  }, 240_000);

  afterAll(async () => {
    await pool?.end();
    await container?.stop();
  });

  it("refuses a banner with any offer setting, and an offer with a link (FR-008)", async () => {
    await expect(banner({ percent_off: 10 })).rejects.toThrow(/promotion_banner_shape_ck/);
    await expect(banner({ trigger: "automatic" })).rejects.toThrow(/promotion_banner_shape_ck/);
    await expect(banner({ max_uses: 5 })).rejects.toThrow(/promotion_banner_shape_ck/);
    await expect(banner({ link_kind: null })).rejects.toThrow(/promotion_link_ck/);
    await expect(offer({ link_kind: "sale" })).rejects.toThrow(/promotion_link_ck/);
  });

  it("prices a basket exactly as if no banner existed (SC-002)", async () => {
    await offer();
    const before = await priced();
    await banner();
    await banner({ headline: "Free delivery on orders over {free_delivery_amount}" });
    const after = await priced();
    expect(after.ids).toEqual(before.ids);
    expect(after.outcome).toEqual(before.outcome);
  });

  it("shows a banner with no code, conditions or countdown, filled from the active plan", async () => {
    const id = await banner({
      headline: "Free delivery on orders over {free_delivery_amount}",
      days_of_week: [1, 2, 3, 4, 5, 6, 7],
      ends_at: new Date(Date.now() + 86_400_000 * 3),
    });
    await place("home-side", id, 50);
    const [group] = await groupPromotions(pool, ["home-side"], { customerId: null, now: new Date() });
    const shown = group!.promotions.find((p) => p.id === id)!;
    expect(shown).toMatchObject({ kind: "banner", headline: "Free delivery on orders over $150", code: null, terms: null, endsIn: null, target: { kind: "search" } });
  });

  it("follows the setting: a new free amount changes the banner, none hides it (FR-010, FR-011)", async () => {
    const id = await banner({ headline: "Free over {free_delivery_amount}" });
    await place("home-hero", id, 50);
    const read = async () => (await groupPromotions(pool, ["home-hero"], { customerId: null, now: new Date() }))[0]!.promotions.find((p) => p.id === id);

    await pool.query(`UPDATE public.delivery_fee_plan SET free_over_amount = 200 WHERE is_active`);
    expect((await read())?.headline).toBe("Free over $200");

    await pool.query(`UPDATE public.delivery_fee_plan SET free_over_amount = NULL WHERE is_active`);
    expect(await read()).toBeUndefined();
    const [rec] = await loadPromotions(pool, { ids: [id] }, new Date());
    expect(hiddenBecause(rec!, null, false, await loadLiveValues(pool))).toBe("live_value_missing");

    await pool.query(`UPDATE public.delivery_fee_plan SET free_over_amount = 150 WHERE is_active`);
  });

  it("goes to its aisle, and is not tappable once the aisle is gone", async () => {
    const cat = await one<{ id: string }>(`INSERT INTO public.category (key, name) VALUES ('test-aisle-108', 'Test aisle 108') RETURNING id::text AS id`);
    const id = await banner({ link_kind: "category", link_category_id: cat.id });
    const [rec] = await loadPromotions(pool, { ids: [id] }, new Date());
    expect(rec!.link).toEqual({ kind: "category", categoryKey: "test-aisle-108", productId: null, broken: false });

    await pool.query(`DELETE FROM public.category WHERE id = $1`, [cat.id]);
    const [gone] = await loadPromotions(pool, { ids: [id] }, new Date());
    expect(gone!.link).toMatchObject({ categoryKey: null, broken: true });
    await place("home-between", id, 50);
    const [group] = await groupPromotions(pool, ["home-between"], { customerId: null, now: new Date() });
    expect(group!.promotions.find((p) => p.id === id)?.target).toBeNull();
  });
});
