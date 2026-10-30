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

import {
  changeStatus, createProduct, deleteProduct, getProduct, listProducts as listProductsReq, presignUpload, registerMedia, setSections,
  setVariantState, submitForReview, updateProduct, withdraw,
} from "./service";
import { parseListQuery } from "@effy/edge-shared";
import { SHOP_PRODUCT_LIST_SPEC } from "./list";

/** The catalogue as its route parses it (103). */
const listProducts = (shopId: string, qs: Record<string, string>) => listProductsReq(shopId, parseListQuery({ pageSize: "100", ...qs }, SHOP_PRODUCT_LIST_SPEC));
import { isProductError } from "./types";

/** A product Effy is still setting up (102) is the shop's to see and nothing else, until it goes on sale. */

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

/** Scent (the leaf's option attribute) and its first three values, read once a product is made. */
let SCENT_ATTR = "";
let SCENT: string[] = [];

/** Live and approved, in two sizes at 10% over the shop's price. */
async function liveProduct(): Promise<{ id: string; options: OptionInputDTO[]; small: VariantInputDTO; large: VariantInputDTO; values: string[] }> {
  const leaf = (await pool.query<{ c: string }>(`SELECT id::text AS c FROM public.category WHERE key = 'laundry-liquid'`)).rows[0]!.c;
  const values = [randomUUID(), randomUUID(), randomUUID()];
  // The leaf offers Scent as its option (105: there is no platform option).
  const scent = await pool.query<{ attr: string; v: string }>(
    `SELECT ad.id::text AS attr, v.id::text AS v FROM public.attribute_definition ad
       JOIN public.attribute_allowed_value v ON v.attribute_definition_id = ad.id
      WHERE ad.key = 'scent' ORDER BY v."position" LIMIT 3`,
  );
  SCENT_ATTR = scent.rows[0]!.attr;
  SCENT = scent.rows.map((r) => r.v);
  const options: OptionInputDTO[] = [{
    id: randomUUID(), position: 1, attributeId: SCENT_ATTR,
    values: [{ id: values[0]!, allowedValueId: SCENT[0]!, position: 0 }, { id: values[1]!, allowedValueId: SCENT[1]!, position: 1 }],
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

const effyOwns = (id: string) =>
  pool.query(
    `UPDATE public.product SET approved_at = NULL, status = 'draft', content_owner = 'effy', created_via = 'effy',
            margin_kind = 'percent', margin_value = 10
      WHERE id = $1`,
    [id],
  );

d("102 — a product Effy is setting up, from the shop's side, against real PostgreSQL", () => {
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

  it("shows it as Effy's, and refuses every write but stock", async () => {
    const p = await liveProduct();
    await effyOwns(p.id);

    const shown = await getProduct(shopId, p.id);
    expect(shown).toMatchObject({ reviewState: "effy_setup", createdBy: "effy", hold: null });
    const listed = (await listProducts(shopId, {})).items.find((i) => i.id === p.id)!;
    expect(listed).toMatchObject({ reviewState: "effy_setup", createdBy: "effy" });

    const writes: [string, () => Promise<unknown>][] = [
      ["update", () => updateProduct(shopId, p.id, { name: "Mine now", expectedUpdatedAt: shown.updatedAt }, "sub-sam")],
      ["status", () => changeStatus(shopId, p.id, { status: "unavailable" })],
      ["submit", () => submitForReview(shopId, p.id)],
      ["withdraw", () => withdraw(shopId, p.id)],
      ["delete", () => deleteProduct(shopId, p.id)],
      ["sections", () => setSections(shopId, p.id, { sectionIds: [] })],
      ["size", () => setVariantState(shopId, p.id, p.small.id, { state: "inactive" })],
      ["presign", () => presignUpload(shopId, p.id, "image/jpeg", 1000)],
      ["register", () => registerMedia(shopId, p.id, { storageKey: `products/${p.id}/x.jpg` })],
    ];
    for (const [what, call] of writes) {
      expect(`${what}: ${await refusal(call())}`).toBe(`${what}: conflict:effy_setting_up`);
    }
    expect((await pool.query(`SELECT name, content_owner FROM public.product WHERE id = $1`, [p.id])).rows[0]).toEqual({
      name: "Laundry liquid", content_owner: "effy",
    });
  });
});
