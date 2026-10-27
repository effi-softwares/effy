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

import { changeStatus, createProduct, getProduct, setVariantState, updateProduct } from "./service";
import { isProductError } from "./types";

/** Effy's hold (102): the shop cannot put a held product or any of its sizes back on sale, by any route. */

const RUN = process.env.CONTAINER_TESTS === "1";
const d = RUN ? describe : describe.skip;

let container: StartedPostgreSqlContainer;
let pool: Pool;
let shopId: string;

/** The refusal's kind and its leading code ("conflict:product_held"). */
const refusal = async (p: Promise<unknown>): Promise<string> => {
  try {
    await p;
    return "no-throw";
  } catch (e) {
    return isProductError(e) ? `${e.kind}:${e.message.split(":")[0]}` : `other:${(e as Error).message}`;
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

const holdIt = (id: string) =>
  pool.query(
    `UPDATE public.product SET held_at = now(), held_by = 'staff', held_reason = 'Recalled', held_prior_status = status,
            status = CASE WHEN status = 'active' THEN 'unavailable' ELSE status END
      WHERE id = $1`,
    [id],
  );

d("102 — a held product, from the shop's side, against real PostgreSQL", () => {
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

  it("refuses every status change while Effy holds it, and says why", async () => {
    const p = await liveProduct();
    await setVariantState(shopId, p.id, p.small.id, { state: "inactive" });
    await holdIt(p.id);
    for (const status of ["active", "unavailable", "draft", "archived"]) {
      expect(await refusal(changeStatus(shopId, p.id, { status }))).toBe("conflict:product_held");
    }
    expect((await pool.query(`SELECT status FROM public.product WHERE id = $1`, [p.id])).rows[0]).toEqual({ status: "unavailable" });
  });

  it("no size goes on sale while held; taking one off sale still works", async () => {
    const p = await liveProduct();
    await holdIt(p.id);
    expect(await refusal(setVariantState(shopId, p.id, p.small.id, { state: "inactive" }))).toBe("no-throw");
    expect(await refusal(setVariantState(shopId, p.id, p.small.id, { state: "active" }))).toBe("conflict:product_held");
    expect((await liveRows(p.id)).map((r) => r.state)).toEqual(["inactive", "active"]);
  });

  it("an edit to a held product still waits for review, and approval is no release", async () => {
    const p = await liveProduct();
    await holdIt(p.id);
    await updateProduct(shopId, p.id, { name: "Laundry liquid, new formula" }, "sub-sam");
    const shown = await getProduct(shopId, p.id);
    expect(shown.reviewState).toBe("live_change_pending");
    expect((await pool.query(`SELECT held_at IS NOT NULL AS held FROM public.product WHERE id = $1`, [p.id])).rows[0]).toEqual({ held: true });
  });
});
