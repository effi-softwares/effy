import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { OptionInputDTO, VariantInputDTO } from "@effy/shared-types";

import { productAvailableSql, variantPurchasableSql } from "../lib/availability";
import { migrationSql } from "../lib/load-migrations";
import { finalizeSucceeded } from "../payments/finalize";
import { applyVariantSet, priceVariants, setVariantState, VariantSetInvalid } from "./variants";
import { readVariantSets } from "./read";

/**
 * 098 — the variant writers against the REAL migrations (tasks T029, T030, T051, T066).
 *
 * ⚠ What is proven here is SQL: the partial uniqueness that lets a removed variant free its stock
 * code and its combination, the listing summary that only `refreshListing` writes, the per-variant
 * row locks that keep two payments for the last unit from both reading "1 on the shelf". A mocked
 * database would agree with whatever the author believed the constraints were.
 */

const RUN = process.env.CONTAINER_TESTS === "1";
const d = RUN ? describe : describe.skip;

let container: StartedPostgreSqlContainer;
let pool: Pool;
let shopId: string;

const uuid = () => crypto.randomUUID();

async function newProduct(): Promise<string> {
  return (await pool.query<{ id: string }>(
    `INSERT INTO public.product (shop_id, product_type_id, primary_category_id, name, short_description, created_by)
     VALUES ($1, (SELECT id FROM public.product_type LIMIT 1), (SELECT id FROM public.category LIMIT 1), 'Rice', 'Long grain', 'seed')
     RETURNING id`, [shopId],
  )).rows[0]!.id;
}

function row(position: number, ids: [string | null, string | null], shopPriceAmount: string, extra: Partial<VariantInputDTO> = {}): VariantInputDTO {
  return {
    id: uuid(), position, optionValueIds: ids, sku: null, gtin: null, shopPriceAmount, shopCompareAtAmount: null,
    weightGrams: null, packQuantity: null, packUnit: null, mediaStorageKey: null, ...extra,
  };
}

/** Size: 500 g / 1 kg; Type: White / Brown. */
function twoOptions(): { options: OptionInputDTO[]; size: [string, string]; type: [string, string] } {
  const size: [string, string] = [uuid(), uuid()];
  const type: [string, string] = [uuid(), uuid()];
  return {
    size, type,
    options: [
      { id: uuid(), position: 1, name: "Size", values: [{ id: size[0], value: "500 g", position: 0 }, { id: size[1], value: "1 kg", position: 1 }] },
      { id: uuid(), position: 2, name: "Type", values: [{ id: type[0], value: "White", position: 0 }, { id: type[1], value: "Brown", position: 1 }] },
    ],
  };
}

/** One transaction on one connection, as the services run the writers. */
async function tx<T>(fn: (c: { query: Pool["query"] }) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const out = await fn(client as never);
    await client.query("COMMIT");
    return out;
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

/** One option, Size, with the given values. */
function sizes(...names: string[]): { options: OptionInputDTO[]; ids: string[] } {
  const ids = names.map(() => uuid());
  return { ids, options: [{ id: uuid(), position: 1, name: "Size", values: names.map((value, i) => ({ id: ids[i]!, value, position: i })) }] };
}

const listing = async (productId: string) =>
  (await pool.query<{ list: string | null; was: string | null; varies: boolean }>(
    `SELECT list_price_amount::text AS list, list_compare_at_amount::text AS was, price_varies AS varies FROM public.product WHERE id = $1`,
    [productId],
  )).rows[0]!;

const refusal = async (p: Promise<unknown>): Promise<string[]> => {
  try {
    await p;
    return [];
  } catch (e) {
    if (e instanceof VariantSetInvalid) return e.errors.map((x) => x.field);
    throw e;
  }
};

d("098 — product variants against real PostgreSQL", () => {
  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:16-alpine").start();
    pool = new Pool({ connectionString: container.getConnectionUri() });
    await pool.query(migrationSql());
  }, 300_000);

  afterAll(async () => {
    await pool?.end();
    await container?.stop();
  });

  beforeEach(async () => {
    shopId = (await pool.query<{ id: string }>(
      `INSERT INTO public.shop (code, name) VALUES ($1, 'Shop') RETURNING id`, [`S${uuid().slice(0, 6)}`],
    )).rows[0]!.id;
  });

  // ── T029 — the one writer's rules ─────────────────────────────────────────────────────────────

  it("a product with no options is exactly one variant; with two options, one per combination sold", async () => {
    const plain = await newProduct();
    await tx((c) => applyVariantSet(c, { productId: plain, shopId, options: [], variants: [row(0, [null, null], "4.00")], mode: "draft" }));

    const sized = await newProduct();
    const { options, size, type } = twoOptions();
    // Three of the four combinations: the shop does not sell 1 kg brown.
    const variants = [row(0, [size[0], type[0]], "3.00"), row(1, [size[0], type[1]], "3.50"), row(2, [size[1], type[0]], "5.50")];
    await tx((c) => applyVariantSet(c, { productId: sized, shopId, options, variants, mode: "draft" }));

    const sets = await readVariantSets(pool, [plain, sized]);
    expect(sets.get(plain)!.variants).toHaveLength(1);
    // Effy's code: generated by the database for every variant, V + six, all different.
    const codes = [...sets.get(plain)!.variants, ...sets.get(sized)!.variants].map((v) => v.code);
    expect(codes.every((c) => /^V[2-9A-HJKMNP-TV-Z]{6}$/.test(c))).toBe(true);
    expect(new Set(codes).size).toBe(4);
    expect(sets.get(plain)!.variants[0]!.label).toBeNull();
    expect(sets.get(sized)!.variants.map((v) => v.label)).toEqual(["500 g / White", "500 g / Brown", "1 kg / White"]);
    // A draft has no customer price yet, so nothing is listed.
    expect(await listing(sized)).toEqual({ list: null, was: null, varies: false });
  });

  it("refuses two variants with the same combination, and a third option — before writing anything", async () => {
    const id = await newProduct();
    const { options, size, type } = twoOptions();
    expect(await refusal(tx((c) => applyVariantSet(c, {
      productId: id, shopId, options, mode: "draft",
      variants: [row(0, [size[0], type[0]], "3.00"), row(1, [size[0], type[0]], "3.10")],
    })))).toContain("variants[1].optionValueIds");

    const third: OptionInputDTO = { id: uuid(), position: 3, name: "Brand", values: [{ id: uuid(), value: "Acme", position: 0 }] };
    expect((await refusal(tx((c) => applyVariantSet(c, {
      productId: id, shopId, options: [...options, third], mode: "draft",
      variants: [row(0, [size[0], type[0]], "3.00")],
    })))).length).toBeGreaterThan(0);
    expect((await pool.query(`SELECT count(*)::int AS n FROM public.product_variant WHERE product_id = $1`, [id])).rows[0].n).toBe(0);
  });

  it("refuses a stock code another product in the shop already uses, naming the cell", async () => {
    const a = await newProduct();
    await tx((c) => applyVariantSet(c, { productId: a, shopId, options: [], variants: [row(0, [null, null], "4.00", { sku: "RICE-1" })], mode: "draft" }));
    const b = await newProduct();
    expect(await refusal(tx((c) => applyVariantSet(c, {
      productId: b, shopId, options: [], variants: [row(0, [null, null], "4.00", { sku: "rice-1" })], mode: "draft",
    })))).toEqual(["variants[0].sku"]);
  });

  it("live: a variant left out is REMOVED, not deleted — and frees its stock code and its combination", async () => {
    const id = await newProduct();
    const two = sizes("500 g", "1 kg");
    const kept = row(0, [two.ids[0]!, null], "3.00", { sku: "R-500" });
    const dropped = row(1, [two.ids[1]!, null], "5.50", { sku: "R-1K" });
    await tx((c) => applyVariantSet(c, { productId: id, shopId, options: two.options, variants: [kept, dropped], mode: "draft" }));
    await pool.query(`UPDATE public.product SET approved_at = now(), status = 'active' WHERE id = $1`, [id]);

    const one = { options: [{ ...two.options[0]!, values: two.options[0]!.values.slice(0, 1) }] };
    const codeBefore = (await readVariantSets(pool, [id])).get(id)!.variants.find((v) => v.id === kept.id)!.code;
    await tx((c) => applyVariantSet(c, { productId: id, shopId, options: one.options, variants: [kept], mode: "live" }));
    // An edit never changes a variant's code.
    expect((await readVariantSets(pool, [id])).get(id)!.variants.find((v) => v.id === kept.id)!.code).toBe(codeBefore);
    const states = (await pool.query(`SELECT id::text, state, removed_at IS NOT NULL AS gone FROM public.product_variant WHERE product_id = $1 ORDER BY position`, [id])).rows;
    expect(states).toEqual([{ id: kept.id, state: "active", gone: false }, { id: dropped.id, state: "removed", gone: true }]);

    // The same size and code may be sold again — as a NEW variant; the removed id stays history.
    const back = uuid();
    const withBack: OptionInputDTO[] = [{ ...one.options[0]!, values: [...one.options[0]!.values, { id: back, value: "1 kg", position: 1 }] }];
    const again = row(1, [back, null], "5.75", { sku: "R-1K" });
    await tx((c) => applyVariantSet(c, { productId: id, shopId, options: withBack, variants: [kept, again], mode: "live" }));

    const third = uuid();
    const withThird: OptionInputDTO[] = [{ ...withBack[0]!, values: [...withBack[0]!.values, { id: third, value: "2 kg", position: 2 }] }];
    expect(await refusal(tx((c) => applyVariantSet(c, {
      productId: id, shopId, options: withThird, mode: "live",
      variants: [kept, again, { ...dropped, position: 2, optionValueIds: [third, null], sku: null }],
    })))).toEqual(["variants[2].id"]);
  });

  // ── T030 — one margin prices every variant; the listing summary follows ───────────────────────

  it("one margin prices EVERY variant, and the listing shows the lowest active price, 'From' when they differ", async () => {
    const id = await newProduct();
    const { options, ids } = sizes("500 g", "1 kg");
    const cheap = row(0, [ids[0]!, null], "3.00", { shopCompareAtAmount: "4.00" });
    const dear = row(1, [ids[1]!, null], "5.50");
    await tx((c) => applyVariantSet(c, { productId: id, shopId, options, variants: [cheap, dear], mode: "draft" }));

    await tx((c) => priceVariants(c, id, { kind: "percent", value: "10" }));
    const prices = (await pool.query(`SELECT price_amount::text AS p, compare_at_amount::text AS w FROM public.product_variant WHERE product_id = $1 ORDER BY position`, [id])).rows;
    expect(prices).toEqual([{ p: "3.30", w: "4.40" }, { p: "6.05", w: null }]);
    expect(await listing(id)).toEqual({ list: "3.30", was: "4.40", varies: true });

    // A margin change reprices them all at once.
    await tx((c) => priceVariants(c, id, { kind: "amount", value: "1" }));
    expect(await listing(id)).toEqual({ list: "4.00", was: "5.00", varies: true });
  });

  // ── T066 — on and off sale, immediately ───────────────────────────────────────────────────────

  it("taking the cheapest size off sale moves 'From' at once; the last size on sale cannot go", async () => {
    const id = await newProduct();
    const { options, ids } = sizes("500 g", "1 kg");
    const cheap = row(0, [ids[0]!, null], "3.00");
    const dear = row(1, [ids[1]!, null], "5.50");
    await tx((c) => applyVariantSet(c, { productId: id, shopId, options, variants: [cheap, dear], mode: "draft" }));
    await tx((c) => priceVariants(c, id, null));

    expect(await tx((c) => setVariantState(c, { productId: id, shopId, variantId: cheap.id, state: "inactive" }))).toBe("ok");
    expect(await listing(id)).toEqual({ list: "5.50", was: null, varies: false });
    expect(await tx((c) => setVariantState(c, { productId: id, shopId, variantId: dear.id, state: "inactive" }))).toBe("last_variant");
    expect(await tx((c) => setVariantState(c, { productId: id, shopId, variantId: dear.id, state: "removed" }))).toBe("last_variant");
    // Another shop cannot touch it.
    const other = (await pool.query<{ id: string }>(`INSERT INTO public.shop (code, name) VALUES ($1, 'Other') RETURNING id`, [`O${uuid().slice(0, 6)}`])).rows[0]!.id;
    expect(await tx((c) => setVariantState(c, { productId: id, shopId: other, variantId: cheap.id, state: "active" }))).toBe("not_found");
  });

  it("a product is available while ANY variant is purchasable; a sold-out or off-sale variant is not", async () => {
    const id = await newProduct();
    const { options, ids } = sizes("500 g", "1 kg");
    const a = row(0, [ids[0]!, null], "3.00");
    const b = row(1, [ids[1]!, null], "5.50");
    await tx((c) => applyVariantSet(c, { productId: id, shopId, options, variants: [a, b], mode: "draft" }));
    await tx((c) => priceVariants(c, id, null));
    await pool.query(`UPDATE public.product SET approved_at = now(), status = 'active' WHERE id = $1`, [id]);
    await pool.query(`UPDATE public.product_variant SET stock_tracked = true, stock_on_hand = 0 WHERE id = $1`, [a.id]);

    const buyable = async () => (await pool.query<{ id: string }>(
      `SELECT v.id::text FROM public.product_variant v JOIN public.product p ON p.id = v.product_id
        WHERE p.id = $1 AND ${variantPurchasableSql("p", "v")} ORDER BY v.position`, [id],
    )).rows.map((r) => r.id);
    const available = async () => (await pool.query(`SELECT 1 FROM public.product p WHERE p.id = $1 AND ${productAvailableSql("p")}`, [id])).rowCount;

    expect(await buyable()).toEqual([b.id]);
    expect(await available()).toBe(1);
    await tx((c) => setVariantState(c, { productId: id, shopId, variantId: a.id, state: "inactive" }));
    await pool.query(`UPDATE public.product_variant SET stock_tracked = true, stock_on_hand = 0 WHERE id = $1`, [b.id]);
    expect(await buyable()).toEqual([]);
    expect(await available()).toBe(0);
  });

  // ── T051 — stock is per variant at payment ────────────────────────────────────────────────────

  it("⚠ two payments for the last unit of ONE size: one is short, the other size is untouched, every movement names its variant", async () => {
    const id = await newProduct();
    const { options, ids } = sizes("500 g", "1 kg");
    const small = row(0, [ids[0]!, null], "3.00");
    const large = row(1, [ids[1]!, null], "5.50");
    await tx((c) => applyVariantSet(c, { productId: id, shopId, options, variants: [small, large], mode: "draft" }));
    await tx((c) => priceVariants(c, id, null));
    await pool.query(`UPDATE public.product SET approved_at = now(), status = 'active' WHERE id = $1`, [id]);
    await pool.query(`UPDATE public.product_variant SET stock_tracked = true, stock_on_hand = 1 WHERE product_id = $1`, [id]);

    const order = async (): Promise<string> => {
      const cust = (await pool.query<{ id: string }>(
        `INSERT INTO public.customer (cognito_sub, email) VALUES ($1, ($1 || '@effyshopping.com')::citext) RETURNING id`, [`c-${uuid()}`],
      )).rows[0]!.id;
      const o = (await pool.query<{ id: string }>(
        `INSERT INTO public."order" (customer_id, order_number, item_subtotal_amount, grand_total_amount, delivery_address, status)
         VALUES ($1, 'EFY-' || substr(gen_random_uuid()::text, 1, 6), 3, 3, '{}'::jsonb, 'pending_payment') RETURNING id`, [cust],
      )).rows[0]!.id;
      await pool.query(
        `INSERT INTO public.order_item (order_id, product_id, variant_id, shop_id, product_name, variant_label, unit_price_amount, quantity, line_subtotal_amount)
         VALUES ($1, $2, $3, $4, 'Rice', '500 g / White', 3.00, 1, 3.00)`, [o, id, small.id, shopId],
      );
      return o;
    };
    const [o1, o2] = [await order(), await order()];
    const [r1, r2] = await Promise.all([tx((c) => finalizeSucceeded(c, o1)), tx((c) => finalizeSucceeded(c, o2))]);

    expect([r1.stockShortfall, r2.stockShortfall].sort()).toEqual([false, true]);
    const stock = (await pool.query(`SELECT id::text, stock_on_hand FROM public.product_variant WHERE product_id = $1 ORDER BY position`, [id])).rows;
    expect(stock).toEqual([{ id: small.id, stock_on_hand: 0 }, { id: large.id, stock_on_hand: 1 }]);
    const moves = (await pool.query(`SELECT variant_id::text AS v, quantity_before AS b, quantity_after AS a FROM public.stock_movement WHERE product_id = $1 ORDER BY created_at, quantity_before DESC`, [id])).rows;
    expect(moves).toEqual([{ v: small.id, b: 1, a: 0 }, { v: small.id, b: 0, a: 0 }]);
  });
});
