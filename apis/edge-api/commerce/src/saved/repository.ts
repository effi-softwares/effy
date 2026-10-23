// Invariant: a customer_saved_item row exists iff the product is in at least one of the customer's
// lists. The entry's foreign key gives one direction; SWEEP_ORPHANS, run in every removing
// transaction, gives the other. Every writer takes the per-customer transaction lock first, or two
// concurrent saves could both pass the cap.
import { pooled, renditionWidthsSql, withTransaction, type Queryable, type Transactor } from "@effy/edge-shared";
import { variantLabelSql } from "@effy/edge-shared/catalog";
import { DEFAULT_LIST_ID, type PackUnit, type UnitBasis } from "@effy/shared-types";

import { isUuid } from "../lib/ids";
import { ListNameTakenError } from "./list-name";

export const DEFAULT_LIST_REF = DEFAULT_LIST_ID;

export class ProductNotFoundError extends Error {}
/** Refused; never resolved by evicting something saved. */
export class CapReachedError extends Error {}
/** Unknown or someone else's, alike. */
export class ListNotFoundError extends Error {}
export class ListLimitError extends Error {}
export class DefaultListError extends Error {}
/** The heart's un-save, refused because the product is in a named list. */
export class InNamedListsError extends Error {}

export interface ListRow {
  product_id: string;
  /** Null when none, or it was removed. */
  variant_id: string | null;
  /** The listing price's variant: what is added when the product has only one. */
  shown_variant_id: string | null;
  variant_label: string | null;
  variant_count: number;
  pack_quantity: string | null;
  pack_unit: PackUnit | null;
  unit_basis: UnitBasis | null;
  name: string;
  brand: string | null;
  price_amount: string;
  currency: string;
  compare_at_amount: string | null;
  storage_key: string | null;
  image_widths: number[] | null;
  saved_at: Date;
  saved_price_amount: string;
  category_key: string | null;
  is_new: boolean;
  price_dropped: boolean;
  verdict: string;
}

export interface ListSummaryRow {
  id: string;
  is_default: boolean;
  name: string | null;
  count: number;
  only_here: number;
  contains: boolean;
}

export interface MergeItem {
  productId: string;
  /** Ignored unless it is one of the product's live variants. */
  variantId: string | null;
  /** Null when the device never saw a price: the current price is the baseline. */
  savedPriceAmount: string | null;
  savedCurrency: string | null;
  savedAt: Date;
}

export interface Skip {
  productId: string;
  reason: string;
}

const MEMBERSHIP = `
SELECT product_id::text AS product_id
FROM public.customer_saved_item
WHERE customer_id = $1
ORDER BY saved_at DESC`;

// `saved_at` is the entry's added_at. An entry is one per product but remembers a variant (rv):
// price, picture and verdict are that variant's while it is sold, else the listing's (sv).
const LIST = `
SELECT s.product_id::text                        AS product_id,
       rv.id::text                               AS variant_id,
       dv.id::text                               AS shown_variant_id,
       ${variantLabelSql("rv")}                  AS variant_label,
       (SELECT count(*)::int FROM public.product_variant cv
         -- availability-exempt: product_variant — counting the choices, not deciding a sale.
         WHERE cv.product_id = p.id AND cv.state = 'active') AS variant_count,
       COALESCE(rv.pack_quantity, dv.pack_quantity)::text AS pack_quantity,
       COALESCE(rv.pack_unit, dv.pack_unit)      AS pack_unit,
       p.unit_basis                              AS unit_basis,
       p.name                                    AS name,
       p.brand                                   AS brand,
       COALESCE(rv.price_amount, p.list_price_amount)::text AS price_amount,
       p.currency                                AS currency,
       (CASE WHEN rv.id IS NOT NULL THEN rv.compare_at_amount ELSE p.list_compare_at_amount END)::text AS compare_at_amount,
       m.storage_key                             AS storage_key,
       m.image_widths                            AS image_widths,
       e.added_at                                AS saved_at,
       s.saved_price_amount::text                AS saved_price_amount,
       c.key                                     AS category_key,
       p.created_at >= now() - interval '14 days' AS is_new,
       (p.currency = s.saved_currency AND COALESCE(rv.price_amount, p.list_price_amount) < s.saved_price_amount) AS price_dropped,
       -- availability-exempt: public.product / product_variant, and deliberately. This CASE does not
       -- decide WHETHER something is purchasable — it classifies WHY it is not, into the two answers a
       -- shopper can act on differently ("wait" vs "give up"). The predicate collapses both into one
       -- boolean, which loses exactly this distinction.
       CASE
         WHEN p.status = 'archived' THEN 'no_longer_sold'
         WHEN p.status <> 'active'  THEN 'temporarily_unavailable'
         WHEN rv.id IS NOT NULL AND rv.state <> 'active' THEN 'temporarily_unavailable'
         WHEN rv.id IS NOT NULL AND rv.stock_tracked AND coalesce(rv.stock_on_hand, 0) <= 0 THEN 'temporarily_unavailable'
         WHEN rv.id IS NULL AND NOT EXISTS (
              -- availability-exempt: product_variant — classifying WHY (the CASE above), not deciding.
              SELECT 1 FROM public.product_variant sv
               WHERE sv.product_id = p.id AND sv.state = 'active'
                 AND (NOT sv.stock_tracked OR sv.stock_on_hand > 0)) THEN 'temporarily_unavailable'
         ELSE 'purchasable'
       END                                       AS verdict
FROM public.customer_list_entry e
JOIN public.customer_saved_item s ON s.customer_id = e.customer_id AND s.product_id = e.product_id
JOIN public.product p ON p.id = e.product_id
-- The remembered variant, while it is still offered (a removed one is forgotten, never substituted).
LEFT JOIN public.product_variant rv ON rv.id = s.variant_id AND rv.state <> 'removed'
-- The variant the listing price comes from, for a pack size when none is remembered.
LEFT JOIN LATERAL (
    SELECT x.id, x.pack_quantity, x.pack_unit FROM public.product_variant x
     -- availability-exempt: product_variant — the shown price's variant, not a sale.
     WHERE x.product_id = p.id AND x.state = 'active'
     ORDER BY x.price_amount NULLS LAST, x.position LIMIT 1
) dv ON true
LEFT JOIN public.category c ON c.id = p.primary_category_id
LEFT JOIN LATERAL (
    SELECT pm.storage_key, pm.alt_text, ${renditionWidthsSql("pm.storage_key")} AS image_widths
    FROM public.product_media pm
    WHERE pm.product_id = p.id
    ORDER BY (pm.id = rv.media_id) DESC NULLS LAST, pm.is_primary DESC, pm.display_order ASC, pm.created_at ASC
    LIMIT 1
) m ON true
WHERE e.customer_id = $1 AND e.list_id = $2
ORDER BY e.added_at DESC`;

const PRODUCT_EXISTS = `SELECT EXISTS (SELECT 1 FROM public.product WHERE id = $1) AS yes`;
const ALREADY_SAVED = `SELECT EXISTS (SELECT 1 FROM public.customer_saved_item WHERE customer_id = $1 AND product_id = $2) AS yes`;
const COUNT_SAVED = `SELECT count(*)::int AS n FROM public.customer_saved_item WHERE customer_id = $1`;

// Taken in the same statement, so the baseline is the price at the moment of saving.
const INSERT_SAVED = `
INSERT INTO public.customer_saved_item (customer_id, product_id, variant_id, saved_price_amount, saved_currency, saved_at)
SELECT $1, p.id, v.id, COALESCE(v.price_amount, p.list_price_amount, 0), p.currency, COALESCE($3::timestamptz, now())
FROM public.product p
LEFT JOIN public.product_variant v ON v.id = $4::uuid AND v.product_id = p.id AND v.state <> 'removed'
WHERE p.id = $2
ON CONFLICT (customer_id, product_id) DO NOTHING`;

// Saving with another variant moves the remembered choice; baseline price and time stay.
const REMEMBER_VARIANT = `
UPDATE public.customer_saved_item s SET variant_id = v.id, updated_at = now()
  FROM public.product_variant v
 WHERE s.customer_id = $1 AND s.product_id = $2
   AND v.id = $3::uuid AND v.product_id = s.product_id AND v.state <> 'removed'
   AND s.variant_id IS DISTINCT FROM v.id`;

const DELETE_SAVED = `DELETE FROM public.customer_saved_item WHERE customer_id = $1 AND product_id = $2`;
const LOCK_CUSTOMER = `SELECT pg_advisory_xact_lock(hashtext($1))`;

const MERGE_INSERT = `
INSERT INTO public.customer_saved_item (customer_id, product_id, variant_id, saved_price_amount, saved_currency, saved_at)
SELECT $1, p.id, v.id, COALESCE($3::numeric, v.price_amount, p.list_price_amount, 0), COALESCE($4, p.currency), $5::timestamptz
FROM public.product p
LEFT JOIN public.product_variant v ON v.id = $6::uuid AND v.product_id = p.id AND v.state <> 'removed'
WHERE p.id = $2
ON CONFLICT (customer_id, product_id) DO NOTHING`;

// The no-op do UPDATE lets RETURNING answer on the conflict path too.
const ENSURE_DEFAULT = `
INSERT INTO public.customer_list (customer_id, is_default)
VALUES ($1, true)
ON CONFLICT (customer_id) WHERE is_default DO UPDATE SET is_default = true
RETURNING id::text AS id`;

const DEFAULT_LIST_ID_SQL = `SELECT id::text AS id FROM public.customer_list WHERE customer_id = $1 AND is_default`;
const OWNED_LIST = `SELECT is_default FROM public.customer_list WHERE id = $2 AND customer_id = $1`;

// Writable: undo restores the entry's position.
const INSERT_ENTRY = `
INSERT INTO public.customer_list_entry (list_id, product_id, customer_id, added_at)
VALUES ($1, $2, $3, COALESCE($4::timestamptz, now()))
ON CONFLICT (list_id, product_id) DO NOTHING`;

const DELETE_ENTRY = `DELETE FROM public.customer_list_entry WHERE list_id = $1 AND product_id = $2 AND customer_id = $3`;

const IN_NAMED_LIST = `
SELECT EXISTS (
    SELECT 1
    FROM public.customer_list_entry e
    JOIN public.customer_list l ON l.id = e.list_id
    WHERE e.customer_id = $1 AND e.product_id = $2 AND NOT l.is_default) AS yes`;

// The other half of the invariant: a product that left its last list is no longer saved.
const SWEEP_ORPHANS = `
DELETE FROM public.customer_saved_item s
WHERE s.customer_id = $1
  AND NOT EXISTS (
      SELECT 1 FROM public.customer_list_entry e
      WHERE e.customer_id = s.customer_id AND e.product_id = s.product_id)`;

const NAMED_PRODUCT_IDS = `
SELECT DISTINCT e.product_id::text AS product_id
FROM public.customer_list_entry e
JOIN public.customer_list l ON l.id = e.list_id
WHERE e.customer_id = $1 AND NOT l.is_default`;

// Bounded by 21 lists and 200 products, so the correlated not exists is cheap. $2 may be null:
// bool_or of NULLs is null, and COALESCE makes it false.
const LISTS = `
SELECT l.id::text AS id,
       l.is_default,
       l.name,
       count(e.product_id)::int AS count,
       (count(e.product_id) FILTER (WHERE NOT EXISTS (
           SELECT 1 FROM public.customer_list_entry o
           WHERE o.customer_id = e.customer_id AND o.product_id = e.product_id AND o.list_id <> e.list_id)))::int AS only_here,
       COALESCE(bool_or(e.product_id = $2::uuid), false) AS contains
FROM public.customer_list l
LEFT JOIN public.customer_list_entry e ON e.list_id = l.id
WHERE l.customer_id = $1
GROUP BY l.id
ORDER BY l.is_default DESC, l.created_at ASC, l.id ASC`;

const COUNT_NAMED_LISTS = `SELECT count(*)::int AS n FROM public.customer_list WHERE customer_id = $1 AND NOT is_default`;
const INSERT_LIST = `INSERT INTO public.customer_list (customer_id, name) VALUES ($1, $2) RETURNING id::text AS id`;
const RENAME_LIST = `UPDATE public.customer_list SET name = $3, updated_at = now() WHERE id = $2 AND customer_id = $1 AND NOT is_default`;
const DELETE_LIST = `DELETE FROM public.customer_list WHERE id = $2 AND customer_id = $1 AND NOT is_default`;

/** The unique index is the name check; only this constraint is translated. */
function isNameTaken(err: unknown): boolean {
  const e = err as { code?: string; constraint?: string } | null;
  return e?.code === "23505" && e.constraint === "customer_list_name_uq";
}

const yes = async (q: Queryable, sql: string, args: unknown[]) => (await q.query<{ yes: boolean }>(sql, args)).rows[0]?.yes === true;
const iso = (d: Date | null) => (d ? d.toISOString() : null);

export interface SavedRepository {
  membershipIds(customerId: string): Promise<string[]>;
  namedProductIds(customerId: string): Promise<string[]>;
  list(customerId: string, listRef: string): Promise<ListRow[]>;
  remove(customerId: string, productId: string): Promise<void>;
  merge(customerId: string, items: readonly MergeItem[], cap: number): Promise<{ added: number; skipped: Skip[]; productIds: string[] }>;
  lists(customerId: string, productId: string | null): Promise<ListSummaryRow[]>;
  createList(customerId: string, name: string, productId: string | null, listLimit: number, cap: number, variantId?: string | null): Promise<string>;
  renameList(customerId: string, listRef: string, name: string): Promise<void>;
  deleteList(customerId: string, listRef: string): Promise<void>;
  /** `variantId`, when given, becomes the remembered variant. */
  addEntry(customerId: string, listRef: string, productId: string, at: Date | null, cap: number, variantId?: string | null): Promise<void>;
  removeEntry(customerId: string, listRef: string, productId: string): Promise<void>;
}

export function createSavedRepository(db: Queryable = pooled, transact: Transactor = withTransaction): SavedRepository {
  /** "default" resolves to the default list, or null if never written (a read never creates it). */
  async function resolveList(q: Queryable, customerId: string, listRef: string): Promise<string | null> {
    if (listRef === DEFAULT_LIST_REF) {
      return (await q.query<{ id: string }>(DEFAULT_LIST_ID_SQL, [customerId])).rows[0]?.id ?? null;
    }
    if (!isUuid(listRef)) throw new ListNotFoundError();
    const owned = (await q.query(OWNED_LIST, [customerId, listRef])).rows[0];
    if (!owned) throw new ListNotFoundError();
    return listRef;
  }

  /** Inside the caller's transaction; the caller holds the lock. */
  async function addEntryTx(tx: Queryable, customerId: string, listId: string, productId: string, at: Date | null, cap: number, variantId: string | null = null) {
    // A malformed variant id is not remembered; the save still succeeds.
    const variant = variantId && isUuid(variantId) ? variantId : null;
    if (!(await yes(tx, PRODUCT_EXISTS, [productId]))) throw new ProductNotFoundError();

    // The cap counts distinct saved products, so placing one in another list never trips it.
    if (!(await yes(tx, ALREADY_SAVED, [customerId, productId]))) {
      const n = (await tx.query<{ n: number }>(COUNT_SAVED, [customerId])).rows[0]?.n ?? 0;
      if (n >= cap) throw new CapReachedError();
    }

    // The saved row first (the entry's FK needs it); do nothing keeps the original price and time.
    await tx.query(INSERT_SAVED, [customerId, productId, iso(at), variant]);
    if (variant) await tx.query(REMEMBER_VARIANT, [customerId, productId, variant]);
    await tx.query(INSERT_ENTRY, [listId, productId, customerId, iso(at)]);
  }

  const locked = <T>(customerId: string, fn: (tx: Queryable) => Promise<T>) =>
    transact(async (tx) => {
      await tx.query(LOCK_CUSTOMER, [customerId]);
      return fn(tx);
    });

  return {
    /** An index-only scan. */
    async membershipIds(customerId) {
      return (await db.query<{ product_id: string }>(MEMBERSHIP, [customerId])).rows.map((r) => r.product_id);
    },

    async namedProductIds(customerId) {
      return (await db.query<{ product_id: string }>(NAMED_PRODUCT_IDS, [customerId])).rows.map((r) => r.product_id);
    },

    async list(customerId, listRef) {
      const listId = await resolveList(db, customerId, listRef);
      if (!listId) return [];
      return (await db.query<ListRow>(LIST, [customerId, listId])).rows;
    },

    /** Refused when the product is in a named list; removing an absent product is a no-op. */
    remove: (customerId, productId) =>
      locked(customerId, async (tx) => {
        if (await yes(tx, IN_NAMED_LIST, [customerId, productId])) throw new InNamedListsError();
        // The entry's foreign key cascades.
        await tx.query(DELETE_SAVED, [customerId, productId]);
      }),

    /** One transaction. `items` arrive newest first, so the cap keeps the newest. */
    merge: (customerId, items, cap) =>
      locked(customerId, async (tx) => {
        let n = (await tx.query<{ n: number }>(COUNT_SAVED, [customerId])).rows[0]?.n ?? 0;
        let added = 0;
        const skipped: Skip[] = [];

        // Device saves join "Saved", created only when there is something to place.
        let defaultId: string | null = null;
        const place = async (productId: string, at: Date) => {
          defaultId ??= (await tx.query<{ id: string }>(ENSURE_DEFAULT, [customerId])).rows[0]!.id;
          await tx.query(INSERT_ENTRY, [defaultId, productId, customerId, iso(at)]);
        };

        for (const it of items) {
          if (!isUuid(it.productId)) {
            skipped.push({ productId: it.productId, reason: "not_found" });
            continue;
          }
          if (await yes(tx, ALREADY_SAVED, [customerId, it.productId])) {
            // Already saved: the account's row stands, but it still joins "Saved".
            await place(it.productId, it.savedAt);
            continue;
          }
          if (!(await yes(tx, PRODUCT_EXISTS, [it.productId]))) {
            // Skipped, never fatal: a product may have been removed meanwhile.
            skipped.push({ productId: it.productId, reason: "not_found" });
            continue;
          }
          if (n >= cap) {
            skipped.push({ productId: it.productId, reason: "cap_reached" });
            continue;
          }
          await tx.query(MERGE_INSERT, [
            customerId, it.productId, it.savedPriceAmount, it.savedCurrency, iso(it.savedAt),
            it.variantId && isUuid(it.variantId) ? it.variantId : null,
          ]);
          await place(it.productId, it.savedAt);
          n += 1;
          added += 1;
        }

        const productIds = (await tx.query<{ product_id: string }>(MEMBERSHIP, [customerId])).rows.map((r) => r.product_id);
        return { added, skipped, productIds };
      }),

    async lists(customerId, productId) {
      return (await db.query<ListSummaryRow>(LISTS, [customerId, productId])).rows;
    },

    createList: (customerId, name, productId, listLimit, cap, variantId = null) =>
      locked(customerId, async (tx) => {
        const n = (await tx.query<{ n: number }>(COUNT_NAMED_LISTS, [customerId])).rows[0]?.n ?? 0;
        if (n >= listLimit) throw new ListLimitError();

        let id: string;
        try {
          id = (await tx.query<{ id: string }>(INSERT_LIST, [customerId, name])).rows[0]!.id;
        } catch (err) {
          if (isNameTaken(err)) throw new ListNameTakenError();
          throw err;
        }
        if (productId) await addEntryTx(tx, customerId, id, productId, null, cap, variantId);
        return id;
      }),

    /** The default list is refused, never treated as "not found". */
    async renameList(customerId, listRef, name) {
      if (listRef === DEFAULT_LIST_REF) throw new DefaultListError();
      if (!isUuid(listRef)) throw new ListNotFoundError();
      const owned = (await db.query<{ is_default: boolean }>(OWNED_LIST, [customerId, listRef])).rows[0];
      if (!owned) throw new ListNotFoundError();
      if (owned.is_default) throw new DefaultListError();
      let changed: number;
      try {
        changed = (await db.query(RENAME_LIST, [customerId, listRef, name])).rowCount ?? 0;
      } catch (err) {
        if (isNameTaken(err)) throw new ListNameTakenError();
        throw err;
      }
      if (changed === 0) throw new ListNotFoundError();
    },

    /** Idempotent: a missing or foreign list ends in the requested state. */
    async deleteList(customerId, listRef) {
      if (listRef === DEFAULT_LIST_REF) throw new DefaultListError();
      if (!isUuid(listRef)) return;
      await locked(customerId, async (tx) => {
        const owned = (await tx.query<{ is_default: boolean }>(OWNED_LIST, [customerId, listRef])).rows[0];
        if (!owned) return;
        if (owned.is_default) throw new DefaultListError();
        await tx.query(DELETE_LIST, [customerId, listRef]);
        await tx.query(SWEEP_ORPHANS, [customerId]);
      });
    },

    /** Idempotent: an existing entry is left as it was. */
    addEntry: (customerId, listRef, productId, at, cap, variantId = null) =>
      locked(customerId, async (tx) => {
        const listId =
          listRef === DEFAULT_LIST_REF
            ?
              (await tx.query<{ id: string }>(ENSURE_DEFAULT, [customerId])).rows[0]!.id
            : (await resolveList(tx, customerId, listRef))!;
        await addEntryTx(tx, customerId, listId, productId, at, cap, variantId);
      }),

    /** Un-saves the product if this was its last list. */
    removeEntry: (customerId, listRef, productId) =>
      locked(customerId, async (tx) => {
        let listId: string | null;
        try {
          listId = await resolveList(tx, customerId, listRef);
        } catch (err) {
          if (err instanceof ListNotFoundError) return;
          throw err;
        }
        if (!listId) return;
        await tx.query(DELETE_ENTRY, [listId, productId, customerId]);
        await tx.query(SWEEP_ORPHANS, [customerId]);
      }),
  };
}
