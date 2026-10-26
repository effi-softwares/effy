import { randomUUID } from "node:crypto";

import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { OptionInputDTO, VariantInputDTO } from "@effy/shared-types";

const holder = vi.hoisted(() => ({ pool: null as Pool | null, announced: [] as unknown[] }));

vi.mock("@effy/edge-shared", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("@effy/edge-shared");
  return {
    ...actual,
    query: (text: string, params?: unknown[]) => holder.pool!.query(text, params as never[]),
    pooled: { query: (text: string, params?: unknown[]) => holder.pool!.query(text, params as never[]) },
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
vi.mock("@effy/edge-shared/live", () => ({
  announce: async (moves: unknown[]) => {
    holder.announced.push(...moves);
  },
}));
vi.mock("./media", () => ({
  presignRead: async (key: string) => `signed:${key}`,
  presignUpload: async () => ({ uploadUrl: "u", storageKey: "k" }),
}));

import { migrationSql } from "@effy/edge-shared/testing";

import { createProduct, getProduct, setVariantState, updateProduct } from "./service";
import { isProductError } from "./types";

/** A new size or price waits for review; taking a size off sale does not (and a removal drops it from the proposal). */

const RUN = process.env.CONTAINER_TESTS === "1";
const d = RUN ? describe : describe.skip;

let container: StartedPostgreSqlContainer;
let pool: Pool;
let shopId: string;

const kindOf = async (p: Promise<unknown>): Promise<string> => {
  try {
    await p;
    return "no-throw";
  } catch (e) {
    return isProductError(e) ? e.kind : `other:${(e as Error).message}`;
  }
};

/** A Pack size value's pack, by position in the option: 500 g, 1 kg, 2 kg. */
const PACKS = [{ packQuantity: "500", packUnit: "g" }, { packQuantity: "1", packUnit: "kg" }, { packQuantity: "2", packUnit: "kg" }] as const;

function variant(position: number, valueId: string, shopPriceAmount: string, id = randomUUID()): VariantInputDTO {
  return {
    id, position, optionValueIds: [valueId, null], sku: null, gtin: null, shopPriceAmount, shopCompareAtAmount: null,
    weightGrams: 500, ...PACKS[position]!, mediaStorageKey: null,
  };
}

/** Every not-removed variant, its state and customer price. */
const liveRows = async (productId: string) =>
  (await pool.query(
    `SELECT id::text, state, price_amount::text AS price, shop_price_amount::text AS shop
       FROM public.product_variant WHERE product_id = $1 ORDER BY position, id`, [productId],
  )).rows;

const proposedVariantIds = async (productId: string): Promise<string[] | null> => {
  const r = await pool.query<{ ids: string[] | null }>(
    `SELECT (SELECT array_agg(x ->> 'id') FROM jsonb_array_elements(proposed -> 'variants') x) AS ids
       FROM public.product_change WHERE product_id = $1`, [productId],
  );
  return r.rowCount === 0 ? null : r.rows[0]!.ids ?? [];
};

/** Live and approved, in two sizes at 10% over the shop's price. */
async function liveProduct(): Promise<{ id: string; options: OptionInputDTO[]; small: VariantInputDTO; large: VariantInputDTO; values: string[] }> {
  const leaf = (await pool.query<{ c: string }>(`SELECT id::text AS c FROM public.category WHERE key = 'laundry-liquid'`)).rows[0]!.c;
  const values = [randomUUID(), randomUUID(), randomUUID()];
  const options: OptionInputDTO[] = [{
    id: randomUUID(), position: 1, kind: "pack_size",
    values: [{ id: values[0]!, position: 0 }, { id: values[1]!, position: 1 }],
  }];
  const small = variant(0, values[0]!, "3.00");
  const large = variant(1, values[1]!, "5.00");
  const created = await createProduct(shopId, {
    primaryCategoryId: leaf, name: "Laundry liquid", shortDescription: "Concentrated",
    options, variants: [small, large], unitBasis: null, gstStatus: "gst_free",
  }, "sub-sam");
  await pool.query(
    `UPDATE public.product SET approved_at = now(), status = 'active', margin_kind = 'percent', margin_value = 10 WHERE id = $1`,
    [created.id],
  );
  await pool.query(`UPDATE public.product_variant SET price_amount = round(shop_price_amount * 1.1, 2) WHERE product_id = $1`, [created.id]);
  return { id: created.id, options, small, large, values };
}

d("098 US6 — a live product's sizes against real PostgreSQL", () => {
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

  beforeEach(async () => {
    holder.announced = [];
    shopId = (await pool.query<{ id: string }>(
      `INSERT INTO public.shop (code, name) VALUES ($1, 'Shop') RETURNING id`, [`S${randomUUID().slice(0, 6)}`],
    )).rows[0]!.id;
  });

  it("a new size and a new price PEND: shoppers keep buying what is live until Effy approves", async () => {
    const p = await liveProduct();
    const before = await liveRows(p.id);

    const withTwoKg: OptionInputDTO[] = [{ ...p.options[0]!, values: [...p.options[0]!.values, { id: p.values[2]!, position: 2 }] }];
    const twoKg = variant(2, p.values[2]!, "9.00");
    await updateProduct(shopId, p.id, { options: withTwoKg, variants: [{ ...p.small, shopPriceAmount: "3.20" }, p.large, twoKg] }, "sub-sam");

    expect(await liveRows(p.id)).toEqual(before);
    expect(await proposedVariantIds(p.id)).toEqual([p.small.id, p.large.id, twoKg.id]);
    const shown = await getProduct(shopId, p.id);
    expect(shown.reviewState).toBe("live_change_pending");
    expect(shown.variants.map((v) => v.shopPriceAmount)).toEqual(["3.00", "5.00"]);

    // Changing it back proposes nothing.
    await updateProduct(shopId, p.id, { options: p.options, variants: [p.small, p.large] }, "sub-sam");
    expect(await proposedVariantIds(p.id)).toBeNull();
  });

  it("⚠ off sale is IMMEDIATE and leaves the pending change alone; removal drops the size from it", async () => {
    const p = await liveProduct();
    await updateProduct(shopId, p.id, { name: "Basmati rice" }, "sub-sam");
    await updateProduct(shopId, p.id, { options: p.options, variants: [{ ...p.small, shopPriceAmount: "3.20" }, p.large] }, "sub-sam");
    const change = async () => JSON.stringify((await pool.query(`SELECT proposed FROM public.product_change WHERE product_id = $1`, [p.id])).rows);
    const pending = await change();

    await setVariantState(shopId, p.id, p.small.id, { state: "inactive" });
    expect((await liveRows(p.id)).map((r) => r.state)).toEqual(["inactive", "active"]);
    expect(await change()).toBe(pending);
    expect(holder.announced).toEqual([{ scope: "shop", shopId, kind: "stock" }]);

    await setVariantState(shopId, p.id, p.small.id, { state: "removed" });
    expect((await liveRows(p.id)).map((r) => r.state)).toEqual(["removed", "active"]);
    expect(await proposedVariantIds(p.id)).toEqual([p.large.id]);
    // The listing summary followed: only the 1 kg is on sale, at its live price.
    const listing = (await pool.query(`SELECT list_price_amount::text AS p, price_varies AS v FROM public.product WHERE id = $1`, [p.id])).rows[0];
    expect(listing).toEqual({ p: "5.50", v: false });
  });

  it("refuses to take the last size off sale, a bad state, and another shop's variant", async () => {
    const p = await liveProduct();
    await setVariantState(shopId, p.id, p.small.id, { state: "inactive" });
    expect(await kindOf(setVariantState(shopId, p.id, p.large.id, { state: "inactive" }))).toBe("conflict");
    expect(await kindOf(setVariantState(shopId, p.id, p.large.id, { state: "removed" }))).toBe("conflict");
    expect(await kindOf(setVariantState(shopId, p.id, p.large.id, { state: "gone" }))).toBe("validation");

    const other = (await pool.query<{ id: string }>(`INSERT INTO public.shop (code, name) VALUES ($1, 'Other') RETURNING id`, [`O${randomUUID().slice(0, 6)}`])).rows[0]!.id;
    expect(await kindOf(setVariantState(other, p.id, p.small.id, { state: "active" }))).toBe("not_found");
    expect((await liveRows(p.id)).map((r) => r.state)).toEqual(["inactive", "active"]);
  });
});
