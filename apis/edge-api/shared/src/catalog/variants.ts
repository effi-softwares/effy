// The one writer of a product's options, values and variants:
//  applyVariantSet make the options and variants exactly the given set (a draft edit; approval of a live change).
//  priceVariants write every variant's customer price from its shop price and the product's margin.
//  setVariantState activate, deactivate or remove one variant, immediately (never reviewed).
// Each recomputes the listing summary in the same transaction. Stock columns belong to the stock
// writers. The rules are `validateVariantSet` in @effy/shared-types, the same as the shop console runs.

import {
  validateVariantSet,
  type OptionInputDTO,
  type UnitBasis,
  type VariantInputDTO,
  type VariantSetError,
  type VariantState,
} from "@effy/shared-types";

import type { Queryable } from "../lib/db";
import { customerPrice, type Margin } from "../lib/margin";
import { refreshListing } from "./listing";

/** Every refusal points at one input (`variants[2].sku`, `options[0].name`, …). */
export class VariantSetInvalid extends Error {
  constructor(readonly errors: VariantSetError[]) {
    super(errors.map((e) => `${e.field}: ${e.message}`).join("; "));
    this.name = "VariantSetInvalid";
  }
}

export interface ApplyVariantSetInput {
  productId: string;
  shopId: string;
  options: readonly OptionInputDTO[];
  variants: readonly VariantInputDTO[];
  /** `undefined` leaves the basis as it is (and validates pack units against it). */
  unitBasis?: UnitBasis | null;
  /** `draft`: a variant left out is deleted. `live`: it is removed (state), kept for order and stock history. */
  mode: "draft" | "live";
}

const PG_UNIQUE = "23505";

/** Inside the caller's transaction. New ids are the client's; existing ones are updated in place, keeping stock and carts. */
export async function applyVariantSet(tx: Queryable, input: ApplyVariantSetInput): Promise<void> {
  const { productId, shopId, options, variants, mode } = input;

  const product = await tx.query<{ unit_basis: UnitBasis | null }>(
    `SELECT unit_basis FROM public.product WHERE id = $1 AND shop_id = $2 FOR UPDATE`,
    [productId, shopId],
  );
  if (product.rowCount === 0) throw new Error(`applyVariantSet: no product ${productId} in shop ${shopId}`);
  const basis = input.unitBasis === undefined ? product.rows[0]!.unit_basis : input.unitBasis;

  const errors = validateVariantSet(options, variants, basis);
  // The pure rules first: a malformed id would fail a query and abort the caller's transaction.
  if (errors.length > 0) throw new VariantSetInvalid(errors);

  const optionIds = options.map((o) => o.id);
  const valueIds = options.flatMap((o) => o.values.map((v) => v.id));
  const variantIds = variants.map((v) => v.id);
  const foreign = await tx.query<{ kind: string; id: string }>(
    `SELECT 'option' AS kind, id::text FROM public.product_option WHERE id = ANY($1::uuid[]) AND product_id <> $4
     UNION ALL
     SELECT 'value', ov.id::text FROM public.product_option_value ov JOIN public.product_option o ON o.id = ov.option_id
      WHERE ov.id = ANY($2::uuid[]) AND o.product_id <> $4
     UNION ALL
     SELECT 'variant', id::text FROM public.product_variant WHERE id = ANY($3::uuid[]) AND product_id <> $4`,
    [optionIds, valueIds, variantIds, productId],
  );
  for (const f of foreign.rows) errors.push({ field: f.kind === "variant" ? "variants" : "options", message: `id ${f.id} belongs to another product` });

  // A removed variant cannot be revived by its id: that is a new variant.
  const removed = await tx.query<{ id: string }>(
    `SELECT id::text FROM public.product_variant WHERE product_id = $1 AND state = 'removed' AND id = ANY($2::uuid[])`,
    [productId, variantIds],
  );
  for (const r of removed.rows) errors.push({ field: `variants[${variantIds.indexOf(r.id)}].id`, message: "that variant was removed; add it as a new one" });

  // Stock codes are unique per shop among variants not removed.
  const skus = variants.map((v) => v.sku?.trim().toLowerCase() ?? "").filter((s) => s !== "");
  if (skus.length > 0) {
    const taken = await tx.query<{ sku: string }>(
      `SELECT lower(sku) AS sku FROM public.product_variant
        WHERE shop_id = $1 AND product_id <> $2 AND state <> 'removed' AND lower(sku) = ANY($3::text[])`,
      [shopId, productId, skus],
    );
    const takenSet = new Set(taken.rows.map((r) => r.sku));
    variants.forEach((v, i) => {
      if (v.sku && takenSet.has(v.sku.trim().toLowerCase())) errors.push({ field: `variants[${i}].sku`, message: "another product in your shop uses this stock code" });
    });
  }

  // A variant's picture must be one of its product's.
  const keys = variants.map((v) => v.mediaStorageKey ?? null).filter((k): k is string => !!k);
  const mediaByKey = new Map<string, string>();
  if (keys.length > 0) {
    const media = await tx.query<{ id: string; storage_key: string }>(
      `SELECT id::text, storage_key FROM public.product_media WHERE product_id = $1 AND storage_key = ANY($2::text[])`,
      [productId, keys],
    );
    for (const m of media.rows) mediaByKey.set(m.storage_key, m.id);
    variants.forEach((v, i) => {
      if (v.mediaStorageKey && !mediaByKey.has(v.mediaStorageKey)) errors.push({ field: `variants[${i}].mediaStorageKey`, message: "choose one of this product's pictures" });
    });
  }

  if (errors.length > 0) throw new VariantSetInvalid(errors);

  try {
    await tx.query(`SET CONSTRAINTS public.product_option_position_uq, public.product_option_value_position_uq DEFERRED`);

    // 1. Variants left out first, freeing their combinations and stock codes.
    if (mode === "draft") {
      await tx.query(`DELETE FROM public.product_variant WHERE product_id = $1 AND NOT (id = ANY($2::uuid[]))`, [productId, variantIds]);
    } else {
      await tx.query(
        `UPDATE public.product_variant SET state = 'removed', removed_at = now(), updated_at = now()
          WHERE product_id = $1 AND state <> 'removed' AND NOT (id = ANY($2::uuid[]))`,
        [productId, variantIds],
      );
    }

    // 2. Options and values left out; only removed variants can still name them (the FK nulls theirs).
    await tx.query(`DELETE FROM public.product_option WHERE product_id = $1 AND NOT (id = ANY($2::uuid[]))`, [productId, optionIds]);
    await tx.query(
      `DELETE FROM public.product_option_value ov USING public.product_option o
        WHERE o.id = ov.option_id AND o.product_id = $1 AND NOT (ov.id = ANY($2::uuid[]))`,
      [productId, valueIds],
    );

    // 3. Options and values, upserted by id.
    for (const o of options) {
      await tx.query(
        `INSERT INTO public.product_option (id, product_id, position, name) VALUES ($1, $2, $3, $4)
         ON CONFLICT (id) DO UPDATE SET position = EXCLUDED.position, name = EXCLUDED.name`,
        [o.id, productId, o.position, o.name.trim()],
      );
      for (const v of o.values) {
        await tx.query(
          `INSERT INTO public.product_option_value (id, option_id, value, position) VALUES ($1, $2, $3, $4)
           ON CONFLICT (id) DO UPDATE SET option_id = EXCLUDED.option_id, value = EXCLUDED.value, position = EXCLUDED.position`,
          [v.id, o.id, v.value.trim(), v.position],
        );
      }
    }
    await tx.query(`SET CONSTRAINTS public.product_option_position_uq, public.product_option_value_position_uq IMMEDIATE`);

    // 4. Variants, upserted by id. A new one starts active and counted at zero, so it cannot be bought
    //  until stock is added. An existing variant's stock and state are never touched here.
    for (const v of variants) {
      const weight = v.weightGrams ?? null;
      await tx.query(
        `INSERT INTO public.product_variant (
             id, product_id, shop_id, option1_value_id, option2_value_id, position, sku, gtin,
             shop_price_amount, shop_compare_at_amount, weight_grams, weight_is_assumed,
             pack_quantity, pack_unit, media_id, stock_tracked, stock_on_hand)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, COALESCE($11::int, 500), $11::int IS NULL, $12, $13, $14, true, 0)
         ON CONFLICT (id) DO UPDATE SET
             option1_value_id       = EXCLUDED.option1_value_id,
             option2_value_id       = EXCLUDED.option2_value_id,
             position               = EXCLUDED.position,
             sku                    = EXCLUDED.sku,
             gtin                   = EXCLUDED.gtin,
             shop_price_amount      = EXCLUDED.shop_price_amount,
             shop_compare_at_amount = EXCLUDED.shop_compare_at_amount,
             -- Recording a weight marks it measured; leaving it out keeps what was there.
             weight_grams           = CASE WHEN $11::int IS NULL THEN public.product_variant.weight_grams ELSE EXCLUDED.weight_grams END,
             weight_is_assumed      = CASE WHEN $11::int IS NULL THEN public.product_variant.weight_is_assumed ELSE false END,
             pack_quantity          = EXCLUDED.pack_quantity,
             pack_unit              = EXCLUDED.pack_unit,
             media_id               = EXCLUDED.media_id,
             updated_at             = now()`,
        [
          v.id, productId, shopId, v.optionValueIds[0] ?? null, v.optionValueIds[1] ?? null, v.position,
          v.sku?.trim() || null, v.gtin?.trim() || null,
          v.shopPriceAmount.trim(), v.shopCompareAtAmount?.toString().trim() || null, weight,
          v.packQuantity?.toString().trim() || null, v.packUnit ?? null,
          v.mediaStorageKey ? mediaByKey.get(v.mediaStorageKey) ?? null : null,
        ],
      );
    }

    if (input.unitBasis !== undefined) {
      await tx.query(`UPDATE public.product SET unit_basis = $2 WHERE id = $1`, [productId, input.unitBasis]);
    }
  } catch (e) {
    // Unreachable in a single writer; under a race they are the truth.
    if ((e as { code?: string }).code === PG_UNIQUE) {
      const c = (e as { constraint?: string }).constraint ?? "";
      if (c.includes("sku")) throw new VariantSetInvalid([{ field: "variants", message: "a stock code is already used in your shop" }]);
      if (c.includes("combination")) throw new VariantSetInvalid([{ field: "variants", message: "two variants have the same combination" }]);
      if (c.includes("name") || c.includes("value")) throw new VariantSetInvalid([{ field: "options", message: "two options or values have the same name" }]);
    }
    throw e;
  }

  await refreshListing(tx, productId);
}

/** From each shop price and the product's one margin (`customerPrice`); a null margin means the shop price. */
export async function priceVariants(tx: Queryable, productId: string, margin: Margin | null): Promise<void> {
  const rows = await tx.query<{ id: string; shop: string; was: string | null }>(
    `SELECT id::text, shop_price_amount::text AS shop, shop_compare_at_amount::text AS was
       FROM public.product_variant WHERE product_id = $1 AND state <> 'removed'`,
    [productId],
  );
  for (const r of rows.rows) {
    await tx.query(
      `UPDATE public.product_variant SET price_amount = $2::numeric, compare_at_amount = $3::numeric, updated_at = now() WHERE id = $1`,
      [r.id, customerPrice(r.shop, margin), r.was === null ? null : customerPrice(r.was, margin)],
    );
  }
  await refreshListing(tx, productId);
}

export type SetVariantStateOutcome = "ok" | "unchanged" | "not_found" | "last_variant";

/** Immediately; never reviewed. The last active variant cannot go (`last_variant`). `removed` is terminal. */
export async function setVariantState(
  tx: Queryable,
  args: { productId: string; shopId: string; variantId: string; state: VariantState },
): Promise<SetVariantStateOutcome> {
  const rows = await tx.query<{ id: string; state: VariantState }>(
    `SELECT id::text, state FROM public.product_variant WHERE product_id = $1 AND shop_id = $2 ORDER BY id FOR UPDATE`,
    [args.productId, args.shopId],
  );
  const target = rows.rows.find((r) => r.id === args.variantId);
  if (!target || target.state === "removed") return "not_found";
  if (target.state === args.state) return "unchanged";

  const activeAfter = rows.rows.filter((r) => (r.id === args.variantId ? args.state : r.state) === "active").length;
  if (activeAfter === 0) return "last_variant";

  await tx.query(
    `UPDATE public.product_variant
        SET state = $2, removed_at = CASE WHEN $2 = 'removed' THEN now() ELSE NULL END, updated_at = now()
      WHERE id = $1`,
    [args.variantId, args.state],
  );
  await refreshListing(tx, args.productId);
  return "ok";
}
