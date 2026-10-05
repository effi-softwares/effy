// Repository layer: SQL only. The server cart stores ONLY product + quantity + the price the line
// was added at; the price a shopper is CHARGED is always re-read from public.product at read time.
// One cart per customer.
//
// ── Two rules every mutation in this file obeys (027) ──────────────────────────────────────────────
//
//  1. It runs in a TRANSACTION, and that transaction carries the `cart.revision` bump and the
//     `cart_change_log` guard with it. The bump cannot be skipped, because a mutation the client
//     cannot detect is a mutation the client's mirror will happily overwrite. The guard cannot be a
//     check-then-write, because that is a race — hence one transaction, not two statements.
//
//  2. It is IDEMPOTENT, or it carries a change id. Quantities are absolute; merge and reorder take
//     the MAXIMUM, never a sum. The single exception is add, which must increment, and which
//     therefore always has a change id to dedupe on.
//
// ⚠ There is NO whole-cart replace. Merge has no "delete what is absent" clause — that clause is
// what would let a stale device wipe lines it had never heard of (027 FR-010).
import { parseCents, pooled, withTransaction, type Queryable, type Transactor } from "@effy/edge-shared";

import type { PromoCode, PromoUsage } from "../promo/promo";

/**
 * The wire shape of a cart read (cart_item ⋈ product ⋈ primary media). The same shape serves
 * set-aside lines, because they are the same thing shown in a different place.
 */
export interface CartLineRow {
  id: string;
  product_id: string;
  shop_id: string;
  quantity: number;
  name: string;
  unit_price_amount: string;
  currency: string;
  status: string;
  stock_tracked: boolean;
  /** NULL exactly when the product is untracked. */
  stock_on_hand: number | null;
  storage_key: string | null;
  /**
   * The price when the line was added — NULL for a line predating 027, and NULL is not
   * "unchanged", it is "unknown": the service must not fabricate a price-change notice from it.
   */
  unit_price_at_add: string | null;
}

export interface CartMeta {
  revision: number;
  /** null when no code is applied. */
  promoCodeId: string | null;
}

export interface ProductStatusRow {
  status: string;
  price_amount: string;
  stock_tracked: boolean;
  stock_on_hand: number | null;
}

/** One line of a past order as a candidate for re-adding. */
export interface ReorderCandidate {
  product_id: string;
  quantity: number;
  name: string;
  /** NULL when the product row is gone (the LEFT JOIN missed). */
  status: string | null;
  stock_tracked: boolean | null;
  stock_on_hand: number | null;
}

const LINE_PROJECTION = `
       ci.id::text            AS id,
       ci.product_id::text    AS product_id,
       p.shop_id::text        AS shop_id,
       ci.quantity            AS quantity,
       p.name                 AS name,
       p.price_amount::text   AS unit_price_amount,
       p.currency             AS currency,
       p.status               AS status,
       p.stock_tracked        AS stock_tracked,
       p.stock_on_hand        AS stock_on_hand,
       ci.unit_price_at_add::text AS unit_price_at_add,
       ci.added_at            AS added_at,
       m.storage_key          AS storage_key`;

const PRIMARY_MEDIA_JOIN = `
LEFT JOIN LATERAL (
    SELECT storage_key FROM public.product_media
    WHERE product_id = p.id
    ORDER BY is_primary DESC, display_order ASC, created_at ASC
    LIMIT 1
) m ON true`;

const PROMO_PROJECTION = `
SELECT id::text                        AS id,
       code                            AS code,
       kind                            AS kind,
       percent_off                     AS percent_off,
       amount_off::text                AS amount_off,
       minimum_subtotal_amount::text   AS minimum_subtotal_amount,
       starts_at                       AS starts_at,
       ends_at                         AS ends_at,
       max_redemptions                 AS max_redemptions,
       max_per_customer                AS max_per_customer,
       status                          AS status
FROM public.promo_code`;

interface PromoRow {
  id: string;
  code: string;
  kind: string;
  percent_off: number | null;
  amount_off: string | null;
  minimum_subtotal_amount: string;
  starts_at: Date | null;
  ends_at: Date | null;
  max_redemptions: number | null;
  max_per_customer: number | null;
  status: string;
}

const toPromo = (row: PromoRow): PromoCode => ({
  id: row.id,
  code: row.code,
  kind: row.kind,
  percentOff: row.percent_off ?? 0,
  amountOffCents: row.amount_off === null ? 0 : parseCents(row.amount_off),
  minimumSubtotalCents: parseCents(row.minimum_subtotal_amount),
  startsAt: row.starts_at,
  endsAt: row.ends_at,
  maxRedemptions: row.max_redemptions,
  maxPerCustomer: row.max_per_customer,
  status: row.status,
});

export interface CartRepository {
  getOrCreateCartId(customerId: string): Promise<string>;
  meta(cartId: string): Promise<CartMeta>;
  lines(cartId: string): Promise<CartLineRow[]>;
  /** Payable lines, set-aside lines and the revision in ONE round trip. */
  allLines(cartId: string): Promise<{ lines: CartLineRow[]; saved: CartLineRow[]; revision: number }>;
  productStatus(productId: string): Promise<ProductStatusRow | null>;
  productSnapshots(productIds: readonly string[]): Promise<CartLineRow[]>;
  orderItemsForReorder(customerId: string, orderId: string): Promise<ReorderCandidate[] | null>;

  // Mutations report whether the change was APPLIED (false = this change id was already applied).
  addItem(cartId: string, productId: string, changeId: string, qty: number, max: number): Promise<boolean>;
  setQty(cartId: string, productId: string, changeId: string, qty: number): Promise<boolean>;
  removeItem(cartId: string, productId: string, changeId: string): Promise<boolean>;
  deleteAllItems(cartId: string, changeId: string): Promise<boolean>;
  /** Sweep specific lines (archived products) as an attributable mutation. */
  deleteLines(cartId: string, productIds: readonly string[]): Promise<void>;
  mergeItems(cartId: string, changeId: string, productIds: readonly string[], quantities: readonly number[], max: number): Promise<boolean>;
  setAside(cartId: string, productId: string, changeId: string): Promise<boolean>;
  restoreSaved(cartId: string, productId: string, changeId: string, max: number): Promise<boolean>;
  deleteSaved(cartId: string, productId: string, changeId: string): Promise<boolean>;

  promoByCode(code: string): Promise<PromoCode | null>;
  promoById(id: string): Promise<PromoCode | null>;
  promoUsageFor(promoCodeId: string, customerId: string): Promise<PromoUsage>;
  setCartPromo(cartId: string, promoCodeId: string | null): Promise<boolean>;
}

/**
 * Run a mutation in a transaction with the revision bump, guarded by the change id when there is
 * one. Returns whether it was applied: a change id already recorded means this exact mutation
 * happened before, so it — and its revision bump — are skipped.
 *
 * ⚠ THE GUARD IS THE FIRST STATEMENT OF THE SAME TRANSACTION. Two deliveries of one change race on
 * the log's primary key: one inserts, the other waits, sees the row, and applies nothing.
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
      // ⚠ NO PRUNE HERE. Retention is a housekeeping concern, not a request-time one: a second
      // statement on every guarded write is a round trip on the shopper's critical path.
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
JOIN public.product p ON p.id = ci.product_id${PRIMARY_MEDIA_JOIN}
WHERE ci.cart_id = $1
ORDER BY ci.added_at ASC, ci.id ASC`,
        [cartId],
      )
    ).rows;

  const promoBy = async (sql: string, arg: string) => {
    const row = (await db.query<PromoRow>(sql, [arg])).rows[0];
    return row ? toPromo(row) : null;
  };

  const repo: CartRepository = {
    /**
     * The customer's cart id, creating the cart on first use (one cart per customer). The no-op
     * DO UPDATE is what makes RETURNING yield the existing row.
     */
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
        await db.query<{ revision: number; promo_code_id: string | null }>(
          `
SELECT revision::int AS revision, promo_code_id::text AS promo_code_id
FROM public.cart WHERE id = $1`,
          [cartId],
        )
      ).rows[0];
      return { revision: row?.revision ?? 0, promoCodeId: row?.promo_code_id ?? null };
    },

    lines: (cartId) => linesFrom("public.cart_item", cartId),

    async allLines(cartId) {
      const all = (
        await db.query<CartLineRow & { revision: number; saved: boolean }>(
          `
SELECT c.revision::int AS revision, false AS saved,${LINE_PROJECTION}
FROM public.cart c
JOIN public.cart_item ci ON ci.cart_id = c.id
JOIN public.product p ON p.id = ci.product_id${PRIMARY_MEDIA_JOIN}
WHERE c.id = $1
UNION ALL
SELECT c.revision::int AS revision, true AS saved,${LINE_PROJECTION}
FROM public.cart c
JOIN public.cart_saved_item ci ON ci.cart_id = c.id
JOIN public.product p ON p.id = ci.product_id${PRIMARY_MEDIA_JOIN}
WHERE c.id = $1
ORDER BY saved, added_at ASC, id ASC`,
          [cartId],
        )
      ).rows;

      // An EMPTY cart returns no rows at all, so the revision has to come from somewhere. One
      // extra trip, and only for a cart with nothing in it.
      const revision = all.length > 0 ? all[0]!.revision : (await repo.meta(cartId)).revision;
      return { lines: all.filter((r) => !r.saved), saved: all.filter((r) => r.saved), revision };
    },

    async productStatus(productId) {
      return (
        (
          await db.query<ProductStatusRow>(
            `
SELECT status AS status, price_amount::text AS price_amount,
       stock_tracked AS stock_tracked, stock_on_hand AS stock_on_hand
FROM public.product WHERE id = $1`,
            [productId],
          )
        ).rows[0] ?? null
      );
    },

    /**
     * Current price/status/image for a set of products, in the line shape, with no cart behind it
     * (the PUBLIC preview): a guest's cart lives on their device. `quantity` is set by the caller.
     */
    async productSnapshots(productIds) {
      if (productIds.length === 0) return [];
      return (
        await db.query<CartLineRow>(
          `
SELECT ''::text              AS id,
       p.id::text            AS product_id,
       p.shop_id::text       AS shop_id,
       0                     AS quantity,
       p.name                AS name,
       p.price_amount::text  AS unit_price_amount,
       p.currency            AS currency,
       p.status              AS status,
       p.stock_tracked       AS stock_tracked,
       p.stock_on_hand       AS stock_on_hand,
       NULL::text            AS unit_price_at_add,
       m.storage_key         AS storage_key
FROM public.product p${PRIMARY_MEDIA_JOIN}
WHERE p.id = ANY($1::uuid[])`,
          [[...productIds]],
        )
      ).rows;
    },

    /**
     * A past order's lines, scoped to its owner.
     *
     * ⚠ The scope is IN THE WHERE CLAUSE, not a check after the read. A lookup by order id alone
     * followed by "is it theirs?" is the IDOR shape: it turns "not found" and "not yours" into two
     * different answers. `null` means either — both are a 404, deliberately.
     *
     * LEFT JOIN, because a product can be deleted outright after an order: the order line still
     * names it, and the service reports it as removed rather than silently dropping it.
     */
    async orderItemsForReorder(customerId, orderId) {
      const rows = (
        await db.query<ReorderCandidate>(
          `
SELECT oi.product_id::text AS product_id,
       oi.quantity         AS quantity,
       oi.product_name     AS name,
       p.status            AS status,
       p.stock_tracked     AS stock_tracked,
       p.stock_on_hand     AS stock_on_hand
FROM public."order" o
JOIN public.order_item oi ON oi.order_id = o.id
LEFT JOIN public.product p ON p.id = oi.product_id
WHERE o.id = $1 AND o.customer_id = $2
ORDER BY oi.id ASC`,
          [orderId, customerId],
        )
      ).rows;
      return rows.length > 0 ? rows : null;
    },

    /**
     * Increment a line by `qty`, capped at `max`, creating it if absent. THE ONLY NON-IDEMPOTENT
     * MUTATION, which is why it always carries a change id. The current price is captured as
     * `unit_price_at_add` on insert and left alone on conflict.
     */
    addItem: (cartId, productId, changeId, qty, max) =>
      inTx(cartId, changeId, async (tx) => {
        await tx.query(
          `
INSERT INTO public.cart_item (cart_id, product_id, quantity, unit_price_at_add)
SELECT $1, $2, $3, p.price_amount FROM public.product p WHERE p.id = $2
ON CONFLICT (cart_id, product_id)
DO UPDATE SET quantity = LEAST(public.cart_item.quantity + EXCLUDED.quantity, $4), updated_at = now()`,
          [cartId, productId, qty, max],
        );
      }),

    /** An ABSOLUTE quantity — naturally idempotent. Never touches the add-time price. */
    setQty: (cartId, productId, changeId, qty) =>
      inTx(cartId, changeId, async (tx) => {
        await tx.query(
          `
UPDATE public.cart_item SET quantity = $3, updated_at = now()
WHERE cart_id = $1 AND product_id = $2`,
          [cartId, productId, qty],
        );
      }),

    removeItem: (cartId, productId, changeId) =>
      inTx(cartId, changeId, async (tx) => {
        await tx.query(`DELETE FROM public.cart_item WHERE cart_id = $1 AND product_id = $2`, [cartId, productId]);
      }),

    /**
     * Empty the payable cart. Set-aside lines survive: clearing a cart is not "forget everything I
     * was considering". The applied promotion is dropped with the lines — an empty cart with a
     * code still applied would be a discount on nothing.
     */
    deleteAllItems: (cartId, changeId) =>
      inTx(cartId, changeId, async (tx) => {
        await tx.query(`DELETE FROM public.cart_item WHERE cart_id = $1`, [cartId]);
        await tx.query(`UPDATE public.cart SET promo_code_id = NULL, promo_applied_at = NULL WHERE id = $1`, [cartId]);
      }),

    async deleteLines(cartId, productIds) {
      if (productIds.length === 0) return;
      await inTx(cartId, "", async (tx) => {
        await tx.query(`DELETE FROM public.cart_item WHERE cart_id = $1 AND product_id = ANY($2::uuid[])`, [
          cartId,
          [...productIds],
        ]);
      });
    },

    /**
     * Union the given lines into the cart with MAXIMUM-quantity semantics (027 FR-009), capped at
     * `max`. A line only in the cart is untouched — there is no delete clause — and repeating the
     * merge changes nothing: max(a, a) = a. Summing would double a product the shopper already
     * holds on another device. Lines whose product no longer exists are dropped by the join.
     */
    mergeItems: (cartId, changeId, productIds, quantities, max) =>
      inTx(cartId, changeId, async (tx) => {
        // Merging nothing is a legitimate no-op: an empty guest cart must not empty the account's.
        if (productIds.length === 0) return;
        await tx.query(
          `
INSERT INTO public.cart_item (cart_id, product_id, quantity, unit_price_at_add)
SELECT $1, t.product_id, LEAST(t.quantity, $4), p.price_amount
FROM unnest($2::uuid[], $3::int[]) AS t(product_id, quantity)
JOIN public.product p ON p.id = t.product_id
ON CONFLICT (cart_id, product_id)
DO UPDATE SET quantity = LEAST(GREATEST(public.cart_item.quantity, EXCLUDED.quantity), $4),
              updated_at = now()`,
          [cartId, [...productIds], [...quantities], max],
        );
      }),

    /** Move a line from the payable cart to "saved for later". No-op if it is not in the cart. */
    setAside: (cartId, productId, changeId) =>
      inTx(cartId, changeId, async (tx) => {
        // The add-time price travels with the line, so a price change is still reported while aside.
        await tx.query(
          `
INSERT INTO public.cart_saved_item (cart_id, product_id, quantity, unit_price_at_add)
SELECT cart_id, product_id, quantity, unit_price_at_add
FROM public.cart_item WHERE cart_id = $1 AND product_id = $2
ON CONFLICT (cart_id, product_id)
DO UPDATE SET quantity = GREATEST(public.cart_saved_item.quantity, EXCLUDED.quantity), updated_at = now()`,
          [cartId, productId],
        );
        await tx.query(`DELETE FROM public.cart_item WHERE cart_id = $1 AND product_id = $2`, [cartId, productId]);
      }),

    /**
     * Move a set-aside line back into the payable cart. The add-time price is REFRESHED to the
     * current price: the shopper is choosing it again, at today's price, and reporting a "price
     * change" against a number they saw weeks ago would be noise.
     */
    restoreSaved: (cartId, productId, changeId, max) =>
      inTx(cartId, changeId, async (tx) => {
        await tx.query(
          `
INSERT INTO public.cart_item (cart_id, product_id, quantity, unit_price_at_add)
SELECT s.cart_id, s.product_id, LEAST(s.quantity, $3), p.price_amount
FROM public.cart_saved_item s
JOIN public.product p ON p.id = s.product_id
WHERE s.cart_id = $1 AND s.product_id = $2
ON CONFLICT (cart_id, product_id)
DO UPDATE SET quantity = LEAST(GREATEST(public.cart_item.quantity, EXCLUDED.quantity), $3),
              updated_at = now()`,
          [cartId, productId, max],
        );
        await tx.query(`DELETE FROM public.cart_saved_item WHERE cart_id = $1 AND product_id = $2`, [cartId, productId]);
      }),

    deleteSaved: (cartId, productId, changeId) =>
      inTx(cartId, changeId, async (tx) => {
        await tx.query(`DELETE FROM public.cart_saved_item WHERE cart_id = $1 AND product_id = $2`, [cartId, productId]);
      }),

    /** Case-insensitive lookup by the typed code. */
    promoByCode: (code) => promoBy(`${PROMO_PROJECTION} WHERE upper(code) = upper($1)`, code),
    promoById: (id) => promoBy(`${PROMO_PROJECTION} WHERE id = $1`, id),

    /** Counted from the redemption rows — the truth — rather than from any stored counter. */
    async promoUsageFor(promoCodeId, customerId) {
      const row = (
        await db.query<{ total: number; by_this_shopper: number }>(
          `
SELECT count(*)::int                                              AS total,
       count(*) FILTER (WHERE customer_id = $2)::int              AS by_this_shopper
FROM public.promo_redemption WHERE promo_code_id = $1`,
          [promoCodeId, customerId],
        )
      ).rows[0];
      return { total: row?.total ?? 0, byThisShopper: row?.by_this_shopper ?? 0 };
    },

    /**
     * Record which code is applied (null clears it). Only the CHOICE is stored; the amount it is
     * worth is derived on every read. Setting the same code twice is a no-op in effect, so it
     * carries no change id.
     */
    setCartPromo: (cartId, promoCodeId) =>
      inTx(cartId, "", async (tx) => {
        await tx.query(
          `
UPDATE public.cart
   SET promo_code_id = $2::uuid,
       promo_applied_at = CASE WHEN $2::uuid IS NULL THEN NULL ELSE now() END
 WHERE id = $1`,
          [cartId, promoCodeId],
        );
      }),
  };
  return repo;
}
