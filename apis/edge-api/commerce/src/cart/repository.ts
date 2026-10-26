// One cart per customer. A line stores variant, quantity and its add-time price; the charged price
// is always re-read from product_variant.
//
// Every mutation runs in one transaction with the `cart.revision` bump and the `cart_change_log`
// guard, and is either idempotent (absolute quantities; merge and reorder take the maximum) or
// carries a change id (add). There is no whole-cart replace: a stale device must not wipe lines.
import { pooled, renditionWidthsSql, withTransaction, type Queryable, type Transactor } from "@effy/edge-shared";
import { variantLabelSql } from "@effy/edge-shared/catalog";
import type { PackUnit, UnitBasis } from "@effy/shared-types";

/**
 * The wire shape of a cart read (cart_item ⋈ product ⋈ primary media). The same shape serves
 * set-aside lines, because they are the same thing shown in a different place.
 */
export interface CartLineRow {
  id: string;
  product_id: string;
  variant_id: string;
  variant_label: string | null;
  /** Sold to adults only. */
  age_restricted: boolean;
  variant_state: string;
  shop_id: string;
  quantity: number;
  name: string;
  /** The variant's current customer price. Null only for a never-approved product (never sold). */
  unit_price_amount: string;
  currency: string;
  status: string;
  stock_tracked: boolean;
  /** Null exactly when the variant is untracked. */
  stock_on_hand: number | null;
  pack_quantity: string | null;
  pack_unit: PackUnit | null;
  unit_basis: UnitBasis | null;
  storage_key: string | null;
  image_widths: number[] | null;
  /** Null means unknown, not unchanged: never infer a price-change notice from it. */
  unit_price_at_add: string | null;
}

export interface CartMeta {
  revision: number;
  promotionCodeId: string | null;
  customerId: string | null;
}

export interface VariantStatusRow {
  product_id: string;
  status: string;
  variant_state: string;
  price_amount: string | null;
  stock_tracked: boolean;
  stock_on_hand: number | null;
}

/** One line of a past order as a candidate for re-adding. */
export interface ReorderCandidate {
  product_id: string;
  variant_id: string;
  /** The label it was sold with. */
  variant_label: string | null;
  quantity: number;
  name: string;
  /** Null when the product row is gone (the left join missed). */
  status: string | null;
  /** Null when the variant row is gone. */
  variant_state: string | null;
  stock_tracked: boolean | null;
  stock_on_hand: number | null;
}

const LINE_PROJECTION = `
       ci.id::text            AS id,
       ci.product_id::text    AS product_id,
       ci.variant_id::text    AS variant_id,
       ${variantLabelSql("v")} AS variant_label,
       v.state                AS variant_state,
       p.age_restricted       AS age_restricted,
       p.shop_id::text        AS shop_id,
       ci.quantity            AS quantity,
       p.name                 AS name,
       v.price_amount::text   AS unit_price_amount,
       p.currency             AS currency,
       p.status               AS status,
       v.stock_tracked        AS stock_tracked,
       v.stock_on_hand        AS stock_on_hand,
       v.pack_quantity::text  AS pack_quantity,
       v.pack_unit            AS pack_unit,
       p.unit_basis           AS unit_basis,
       ci.unit_price_at_add::text AS unit_price_at_add,
       ci.added_at            AS added_at,
       m.storage_key          AS storage_key,
       m.image_widths         AS image_widths`;

/** The variant's own picture if it has one, else the product's primary. */
const PRIMARY_MEDIA_JOIN = `
LEFT JOIN LATERAL (
    SELECT pm.storage_key, ${renditionWidthsSql("pm.storage_key")} AS image_widths
    FROM public.product_media pm
    WHERE pm.product_id = p.id
    ORDER BY (pm.id = v.media_id) DESC NULLS LAST, pm.is_primary DESC, pm.display_order ASC, pm.created_at ASC
    LIMIT 1
) m ON true`;

export interface CartRepository {
  getOrCreateCartId(customerId: string): Promise<string>;
  meta(cartId: string): Promise<CartMeta>;
  lines(cartId: string): Promise<CartLineRow[]>;
  /** Payable lines, set-aside lines and the revision in one round trip. */
  allLines(cartId: string): Promise<{ lines: CartLineRow[]; saved: CartLineRow[]; revision: number }>;
  variantStatus(variantId: string): Promise<VariantStatusRow | null>;
  variantSnapshots(variantIds: readonly string[]): Promise<CartLineRow[]>;
  orderItemsForReorder(customerId: string, orderId: string): Promise<ReorderCandidate[] | null>;

  // Mutations return whether they applied (false: this change id was already applied).
  addItem(cartId: string, variantId: string, changeId: string, qty: number, max: number): Promise<boolean>;
  setQty(cartId: string, variantId: string, changeId: string, qty: number): Promise<boolean>;
  removeItem(cartId: string, variantId: string, changeId: string): Promise<boolean>;
  deleteAllItems(cartId: string, changeId: string): Promise<boolean>;
  /** Sweep specific lines (archived products, removed variants) as an attributable mutation. */
  deleteLines(cartId: string, variantIds: readonly string[]): Promise<void>;
  mergeItems(cartId: string, changeId: string, variantIds: readonly string[], quantities: readonly number[], max: number): Promise<boolean>;
  setAside(cartId: string, variantId: string, changeId: string): Promise<boolean>;
  restoreSaved(cartId: string, variantId: string, changeId: string, max: number): Promise<boolean>;
  deleteSaved(cartId: string, variantId: string, changeId: string): Promise<boolean>;

  setCartPromo(cartId: string, promotionCodeId: string | null): Promise<boolean>;
}

/**
 * Runs a mutation with the revision bump, guarded by the change id when given. The guard insert is
 * the transaction's first statement, so two deliveries of one change race on its primary key.
 */
async function guarded(
  transact: Transactor,
  cartId: string,
  changeId: string,
  fn: (tx: Queryable) => Promise<void>,
): Promise<boolean> {
  return transact(async (tx) => {
    if (changeId !== "") {
      const res = await tx.query(
        `
INSERT INTO public.cart_change_log (cart_id, change_id) VALUES ($1, $2)
ON CONFLICT (cart_id, change_id) DO NOTHING`,
        [cartId, changeId],
      );
      // No prune here: retention is housekeeping, not a round trip on every write.
      if ((res.rowCount ?? 0) === 0) return false;
    }
    await fn(tx);
    await tx.query(`UPDATE public.cart SET revision = revision + 1, updated_at = now() WHERE id = $1`, [cartId]);
    return true;
  });
}

export function createCartRepository(db: Queryable = pooled, transact: Transactor = withTransaction): CartRepository {
  const inTx = (cartId: string, changeId: string, fn: (tx: Queryable) => Promise<void>) =>
    guarded(transact, cartId, changeId, fn);

  const linesFrom = async (table: "public.cart_item" | "public.cart_saved_item", cartId: string) =>
    // `table` is one of two literals in this file — never caller input.
    (
      await db.query<CartLineRow>(
        `
SELECT${LINE_PROJECTION}
FROM ${table} ci
JOIN public.product p ON p.id = ci.product_id
JOIN public.product_variant v ON v.id = ci.variant_id${PRIMARY_MEDIA_JOIN}
WHERE ci.cart_id = $1
ORDER BY ci.added_at ASC, ci.id ASC`,
        [cartId],
      )
    ).rows;

  const repo: CartRepository = {
    /** The customer's cart id, created on first use. The no-op do UPDATE makes RETURNING yield it. */
    async getOrCreateCartId(customerId) {
      const row = (
        await db.query<{ id: string }>(
          `
INSERT INTO public.cart (customer_id) VALUES ($1)
ON CONFLICT (customer_id) DO UPDATE SET customer_id = public.cart.customer_id
RETURNING id::text AS id`,
          [customerId],
        )
      ).rows[0];
      if (!row) throw new Error("cart: upsert returned no row");
      return row.id;
    },

    async meta(cartId) {
      const row = (
        await db.query<{ revision: number; promotion_code_id: string | null; customer_id: string | null }>(
          `
SELECT revision::int AS revision, promotion_code_id::text AS promotion_code_id, customer_id::text AS customer_id
FROM public.cart WHERE id = $1`,
          [cartId],
        )
      ).rows[0];
      return { revision: row?.revision ?? 0, promotionCodeId: row?.promotion_code_id ?? null, customerId: row?.customer_id ?? null };
    },

    lines: (cartId) => linesFrom("public.cart_item", cartId),

    async allLines(cartId) {
      const all = (
        await db.query<CartLineRow & { revision: number; saved: boolean }>(
          `
SELECT c.revision::int AS revision, false AS saved,${LINE_PROJECTION}
FROM public.cart c
JOIN public.cart_item ci ON ci.cart_id = c.id
JOIN public.product p ON p.id = ci.product_id
JOIN public.product_variant v ON v.id = ci.variant_id${PRIMARY_MEDIA_JOIN}
WHERE c.id = $1
UNION ALL
SELECT c.revision::int AS revision, true AS saved,${LINE_PROJECTION}
FROM public.cart c
JOIN public.cart_saved_item ci ON ci.cart_id = c.id
JOIN public.product p ON p.id = ci.product_id
JOIN public.product_variant v ON v.id = ci.variant_id${PRIMARY_MEDIA_JOIN}
WHERE c.id = $1
ORDER BY saved, added_at ASC, id ASC`,
          [cartId],
        )
      ).rows;

      // An empty cart returns no rows, so its revision needs its own read.
      const revision = all.length > 0 ? all[0]!.revision : (await repo.meta(cartId)).revision;
      return { lines: all.filter((r) => !r.saved), saved: all.filter((r) => r.saved), revision };
    },

    async variantStatus(variantId) {
      return (
        (
          await db.query<VariantStatusRow>(
            `
SELECT v.product_id::text AS product_id, p.status AS status, v.state AS variant_state,
       v.price_amount::text AS price_amount, v.stock_tracked AS stock_tracked, v.stock_on_hand AS stock_on_hand
FROM public.product_variant v JOIN public.product p ON p.id = v.product_id
WHERE v.id = $1`,
            [variantId],
          )
        ).rows[0] ?? null
      );
    },

    /** Lines for variants with no cart behind them (the public preview). The caller sets `quantity`. */
    async variantSnapshots(variantIds) {
      if (variantIds.length === 0) return [];
      return (
        await db.query<CartLineRow>(
          `
SELECT ''::text              AS id,
       p.id::text            AS product_id,
       v.id::text            AS variant_id,
       ${variantLabelSql("v")} AS variant_label,
       v.state               AS variant_state,
       p.age_restricted      AS age_restricted,
       p.shop_id::text       AS shop_id,
       0                     AS quantity,
       p.name                AS name,
       v.price_amount::text  AS unit_price_amount,
       p.currency            AS currency,
       p.status              AS status,
       v.stock_tracked       AS stock_tracked,
       v.stock_on_hand       AS stock_on_hand,
       v.pack_quantity::text AS pack_quantity,
       v.pack_unit           AS pack_unit,
       p.unit_basis          AS unit_basis,
       NULL::text            AS unit_price_at_add,
       m.storage_key         AS storage_key,
       m.image_widths        AS image_widths
FROM public.product_variant v
JOIN public.product p ON p.id = v.product_id${PRIMARY_MEDIA_JOIN}
WHERE v.id = ANY($1::uuid[])`,
          [[...variantIds]],
        )
      ).rows;
    },

    /**
     * A past order's lines, scoped to its owner in the where clause so "not found" and "not yours" are
     * the same null. Left join: a deleted product is reported as removed, not dropped.
     */
    async orderItemsForReorder(customerId, orderId) {
      const rows = (
        await db.query<ReorderCandidate>(
          `
SELECT oi.product_id::text AS product_id,
       oi.variant_id::text AS variant_id,
       oi.variant_label    AS variant_label,
       oi.quantity         AS quantity,
       oi.product_name     AS name,
       p.status            AS status,
       v.state             AS variant_state,
       v.stock_tracked     AS stock_tracked,
       v.stock_on_hand     AS stock_on_hand
FROM public."order" o
JOIN public.order_item oi ON oi.order_id = o.id
LEFT JOIN public.product p ON p.id = oi.product_id
LEFT JOIN public.product_variant v ON v.id = oi.variant_id
WHERE o.id = $1 AND o.customer_id = $2
ORDER BY oi.id ASC`,
          [orderId, customerId],
        )
      ).rows;
      return rows.length > 0 ? rows : null;
    },

    /** The only non-idempotent mutation, hence the change id. Captures the add-time price on insert. */
    addItem: (cartId, variantId, changeId, qty, max) =>
      inTx(cartId, changeId, async (tx) => {
        await tx.query(
          `
INSERT INTO public.cart_item (cart_id, product_id, variant_id, quantity, unit_price_at_add)
SELECT $1, v.product_id, v.id, $3, v.price_amount FROM public.product_variant v WHERE v.id = $2
ON CONFLICT (cart_id, variant_id)
DO UPDATE SET quantity = LEAST(public.cart_item.quantity + EXCLUDED.quantity, $4), updated_at = now()`,
          [cartId, variantId, qty, max],
        );
      }),

    setQty: (cartId, variantId, changeId, qty) =>
      inTx(cartId, changeId, async (tx) => {
        await tx.query(
          `
UPDATE public.cart_item SET quantity = $3, updated_at = now()
WHERE cart_id = $1 AND variant_id = $2`,
          [cartId, variantId, qty],
        );
      }),

    removeItem: (cartId, variantId, changeId) =>
      inTx(cartId, changeId, async (tx) => {
        await tx.query(`DELETE FROM public.cart_item WHERE cart_id = $1 AND variant_id = $2`, [cartId, variantId]);
      }),

    /** Set-aside lines survive. The applied code goes too: a discount on nothing makes no sense. */
    deleteAllItems: (cartId, changeId) =>
      inTx(cartId, changeId, async (tx) => {
        await tx.query(`DELETE FROM public.cart_item WHERE cart_id = $1`, [cartId]);
        await tx.query(`UPDATE public.cart SET promotion_code_id = NULL, promo_applied_at = NULL WHERE id = $1`, [cartId]);
      }),

    async deleteLines(cartId, variantIds) {
      if (variantIds.length === 0) return;
      await inTx(cartId, "", async (tx) => {
        await tx.query(`DELETE FROM public.cart_item WHERE cart_id = $1 AND variant_id = ANY($2::uuid[])`, [
          cartId,
          [...variantIds],
        ]);
      });
    },

    /** Maximum-quantity union, capped at `max`; no delete clause, so repeating it changes nothing. */
    mergeItems: (cartId, changeId, variantIds, quantities, max) =>
      inTx(cartId, changeId, async (tx) => {
        // An empty guest cart must not empty the account's.
        if (variantIds.length === 0) return;
        await tx.query(
          `
INSERT INTO public.cart_item (cart_id, product_id, variant_id, quantity, unit_price_at_add)
SELECT $1, v.product_id, v.id, LEAST(t.quantity, $4), v.price_amount
FROM unnest($2::uuid[], $3::int[]) AS t(variant_id, quantity)
JOIN public.product_variant v ON v.id = t.variant_id
ON CONFLICT (cart_id, variant_id)
DO UPDATE SET quantity = LEAST(GREATEST(public.cart_item.quantity, EXCLUDED.quantity), $4),
              updated_at = now()`,
          [cartId, [...variantIds], [...quantities], max],
        );
      }),

    setAside: (cartId, variantId, changeId) =>
      inTx(cartId, changeId, async (tx) => {
        // The add-time price travels with the line, so a price change is still reported.
        await tx.query(
          `
INSERT INTO public.cart_saved_item (cart_id, product_id, variant_id, quantity, unit_price_at_add)
SELECT cart_id, product_id, variant_id, quantity, unit_price_at_add
FROM public.cart_item WHERE cart_id = $1 AND variant_id = $2
ON CONFLICT (cart_id, variant_id)
DO UPDATE SET quantity = GREATEST(public.cart_saved_item.quantity, EXCLUDED.quantity), updated_at = now()`,
          [cartId, variantId],
        );
        await tx.query(`DELETE FROM public.cart_item WHERE cart_id = $1 AND variant_id = $2`, [cartId, variantId]);
      }),

    /** Refreshes the add-time price: the shopper is choosing it again at today's price. */
    restoreSaved: (cartId, variantId, changeId, max) =>
      inTx(cartId, changeId, async (tx) => {
        await tx.query(
          `
INSERT INTO public.cart_item (cart_id, product_id, variant_id, quantity, unit_price_at_add)
SELECT s.cart_id, s.product_id, s.variant_id, LEAST(s.quantity, $3), v.price_amount
FROM public.cart_saved_item s
JOIN public.product_variant v ON v.id = s.variant_id
WHERE s.cart_id = $1 AND s.variant_id = $2
ON CONFLICT (cart_id, variant_id)
DO UPDATE SET quantity = LEAST(GREATEST(public.cart_item.quantity, EXCLUDED.quantity), $3),
              updated_at = now()`,
          [cartId, variantId, max],
        );
        await tx.query(`DELETE FROM public.cart_saved_item WHERE cart_id = $1 AND variant_id = $2`, [cartId, variantId]);
      }),

    deleteSaved: (cartId, variantId, changeId) =>
      inTx(cartId, changeId, async (tx) => {
        await tx.query(`DELETE FROM public.cart_saved_item WHERE cart_id = $1 AND variant_id = $2`, [cartId, variantId]);
      }),

    /** Only the choice is stored; its worth is derived on every read. */
    setCartPromo: (cartId, promotionCodeId) =>
      inTx(cartId, "", async (tx) => {
        await tx.query(
          `
UPDATE public.cart
   SET promotion_code_id = $2::uuid,
       promo_applied_at = CASE WHEN $2::uuid IS NULL THEN NULL ELSE now() END
 WHERE id = $1`,
          [cartId, promotionCodeId],
        );
      }),
  };
  return repo;
}
