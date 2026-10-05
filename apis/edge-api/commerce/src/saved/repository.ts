// Saved items and lists (033, 068): SQL only.
//
// ⚠ THE INVARIANT: a customer_saved_item row exists IF AND ONLY IF the product is in at least one
// of that customer's lists. The entry's foreign key enforces "entry ⇒ saved row". The other
// direction has no trigger; it is SWEEP_ORPHANS, run inside every transaction that removes an entry
// or a list.
//
// ⚠ EVERY WRITER TAKES THE PER-CUSTOMER LOCK FIRST. Without it the cap is not a cap: two concurrent
// saves at 199 can each count 199 under READ COMMITTED and both commit, landing the shopper at 201.
// It is scoped to one customer, so it never contends across shoppers, and it is transaction-scoped,
// so it is released by COMMIT or ROLLBACK with nothing to forget.
import { pooled, withTransaction, type Queryable, type Transactor } from "@effy/edge-shared";
import { DEFAULT_LIST_ID } from "@effy/shared-types";

import { isUuid } from "../lib/ids";
import { ListNameTakenError } from "./list-name";

/**
 * The list id the wire uses for the default list — no client needs the default's real id. Taken
 * from the shared contract, so the clients and the backend cannot spell it two ways.
 */
export const DEFAULT_LIST_REF = DEFAULT_LIST_ID;

/** You cannot watch a product that does not exist. */
export class ProductNotFoundError extends Error {}
/** At the cap. ⚠ Refused, NEVER resolved by evicting something the shopper deliberately saved. */
export class CapReachedError extends Error {}
/** No such list for THIS shopper — the same answer whether it is unknown or someone else's. */
export class ListNotFoundError extends Error {}
/** At the limit of named lists. Nothing is removed to make room. */
export class ListLimitError extends Error {}
/** The default list cannot be renamed or deleted. */
export class DefaultListError extends Error {}
/** The heart's un-save, refused because the product is in a named list. */
export class InNamedListsError extends Error {}

export interface ListRow {
  product_id: string;
  name: string;
  brand: string | null;
  price_amount: string;
  currency: string;
  compare_at_amount: string | null;
  storage_key: string | null;
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
  /** Null when the device never observed a price: the product's current price is the baseline. */
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

// ⚠ `saved_at` here is the ENTRY's added_at: when the product joined THIS list (068).
const LIST = `
SELECT s.product_id::text                        AS product_id,
       p.name                                    AS name,
       p.brand                                   AS brand,
       p.price_amount::text                      AS price_amount,
       p.currency                                AS currency,
       p.compare_at_amount::text                 AS compare_at_amount,
       m.storage_key                             AS storage_key,
       e.added_at                                AS saved_at,
       s.saved_price_amount::text                AS saved_price_amount,
       c.key                                     AS category_key,
       p.created_at >= now() - interval '14 days' AS is_new,
       (p.currency = s.saved_currency AND p.price_amount < s.saved_price_amount) AS price_dropped,
       -- availability-exempt: public.product, and deliberately. This CASE does not decide WHETHER
       -- the product is purchasable — it classifies WHY it is not, into the two answers a shopper can
       -- act on differently ("wait" vs "give up"). The predicate collapses both into one boolean,
       -- which is exactly the distinction 054 FR-014 exists to preserve.
       CASE
         WHEN p.status = 'archived' THEN 'no_longer_sold'
         WHEN p.status <> 'active'  THEN 'temporarily_unavailable'
         WHEN p.stock_tracked AND coalesce(p.stock_on_hand, 0) <= 0 THEN 'temporarily_unavailable'
         ELSE 'purchasable'
       END                                       AS verdict
FROM public.customer_list_entry e
JOIN public.customer_saved_item s ON s.customer_id = e.customer_id AND s.product_id = e.product_id
JOIN public.product p ON p.id = e.product_id
LEFT JOIN public.category c ON c.id = p.primary_category_id
LEFT JOIN LATERAL (
    SELECT storage_key, alt_text
    FROM public.product_media
    WHERE product_id = p.id
    ORDER BY is_primary DESC, display_order ASC, created_at ASC
    LIMIT 1
) m ON true
WHERE e.customer_id = $1 AND e.list_id = $2
ORDER BY e.added_at DESC`;

const PRODUCT_EXISTS = `SELECT EXISTS (SELECT 1 FROM public.product WHERE id = $1) AS yes`;
const ALREADY_SAVED = `SELECT EXISTS (SELECT 1 FROM public.customer_saved_item WHERE customer_id = $1 AND product_id = $2) AS yes`;
const COUNT_SAVED = `SELECT count(*)::int AS n FROM public.customer_saved_item WHERE customer_id = $1`;

// ⚠ saved_price_amount is taken from the product IN THE SAME STATEMENT, so the baseline is the
// price that actually existed at the moment of saving.
const INSERT_SAVED = `
INSERT INTO public.customer_saved_item (customer_id, product_id, saved_price_amount, saved_currency, saved_at)
SELECT $1, p.id, p.price_amount, p.currency, COALESCE($3::timestamptz, now())
FROM public.product p
WHERE p.id = $2
ON CONFLICT (customer_id, product_id) DO NOTHING`;

const DELETE_SAVED = `DELETE FROM public.customer_saved_item WHERE customer_id = $1 AND product_id = $2`;
const LOCK_CUSTOMER = `SELECT pg_advisory_xact_lock(hashtext($1))`;

const MERGE_INSERT = `
INSERT INTO public.customer_saved_item (customer_id, product_id, saved_price_amount, saved_currency, saved_at)
SELECT $1, p.id, COALESCE($3::numeric, p.price_amount), COALESCE($4, p.currency), $5::timestamptz
FROM public.product p
WHERE p.id = $2
ON CONFLICT (customer_id, product_id) DO NOTHING`;

// ⚠ ONE STATEMENT THAT BOTH CREATES AND RETURNS. The no-op DO UPDATE is what lets RETURNING answer
// on the conflict path too; DO NOTHING returns no row.
const ENSURE_DEFAULT = `
INSERT INTO public.customer_list (customer_id, is_default)
VALUES ($1, true)
ON CONFLICT (customer_id) WHERE is_default DO UPDATE SET is_default = true
RETURNING id::text AS id`;

const DEFAULT_LIST_ID_SQL = `SELECT id::text AS id FROM public.customer_list WHERE customer_id = $1 AND is_default`;
const OWNED_LIST = `SELECT is_default FROM public.customer_list WHERE id = $2 AND customer_id = $1`;

// added_at is writable: undo restores the position the entry held.
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

// ⚠ THE OTHER HALF OF THE INVARIANT. A product that has just left its last list is no longer saved:
// its heart empties and its remembered price is forgotten (068 FR-032).
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

// ⚠ ONE STATEMENT FOR EVERY LIST, its count, and how much of it lives nowhere else. Bounded by 21
// lists and 200 products, so the correlated NOT EXISTS is cheap.
//
// $2 is the product the chooser is asking about, or NULL: `e.product_id = NULL` is NULL, bool_or of
// NULLs is NULL, and COALESCE turns that into false.
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

/**
 * The unique index IS the name check: there is no read-then-insert to race. Only THIS constraint
 * is translated; any other unique violation is an unexpected error and stays one.
 */
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
  createList(customerId: string, name: string, productId: string | null, listLimit: number, cap: number): Promise<string>;
  renameList(customerId: string, listRef: string, name: string): Promise<void>;
  deleteList(customerId: string, listRef: string): Promise<void>;
  addEntry(customerId: string, listRef: string, productId: string, at: Date | null, cap: number): Promise<void>;
  removeEntry(customerId: string, listRef: string, productId: string): Promise<void>;
}

export function createSavedRepository(db: Queryable = pooled, transact: Transactor = withTransaction): SavedRepository {
  /**
   * A list reference → its id. "default" resolves to the shopper's default list, or `null` when it
   * has never been written to (a read never creates it). Anything else must be a uuid they own.
   */
  async function resolveList(q: Queryable, customerId: string, listRef: string): Promise<string | null> {
    if (listRef === DEFAULT_LIST_REF) {
      return (await q.query<{ id: string }>(DEFAULT_LIST_ID_SQL, [customerId])).rows[0]?.id ?? null;
    }
    if (!isUuid(listRef)) throw new ListNotFoundError();
    const owned = (await q.query(OWNED_LIST, [customerId, listRef])).rows[0];
    if (!owned) throw new ListNotFoundError();
    return listRef;
  }

  /** Put a product in a list inside the caller's transaction. The caller holds the lock. */
  async function addEntryTx(tx: Queryable, customerId: string, listId: string, productId: string, at: Date | null, cap: number) {
    if (!(await yes(tx, PRODUCT_EXISTS, [productId]))) throw new ProductNotFoundError();

    // ⚠ The cap counts DISTINCT SAVED PRODUCTS (068 FR-033). Placing an already-saved product in
    // another list adds nothing to it and must never trip it.
    if (!(await yes(tx, ALREADY_SAVED, [customerId, productId]))) {
      const n = (await tx.query<{ n: number }>(COUNT_SAVED, [customerId])).rows[0]?.n ?? 0;
      if (n >= cap) throw new CapReachedError();
    }

    // The saved row first: the entry's foreign key needs it. ON CONFLICT DO NOTHING keeps the
    // ORIGINAL price and time when the product is already saved through another list.
    await tx.query(INSERT_SAVED, [customerId, productId, iso(at)]);
    await tx.query(INSERT_ENTRY, [listId, productId, customerId, iso(at)]);
  }

  const locked = <T>(customerId: string, fn: (tx: Queryable) => Promise<T>) =>
    transact(async (tx) => {
      await tx.query(LOCK_CUSTOMER, [customerId]);
      return fn(tx);
    });

  return {
    /** Which products this shopper has saved, newest first. An index-only scan: no joins. */
    async membershipIds(customerId) {
      return (await db.query<{ product_id: string }>(MEMBERSHIP, [customerId])).rows.map((r) => r.product_id);
    },

    /** The products held in at least one NAMED list. */
    async namedProductIds(customerId) {
      return (await db.query<{ product_id: string }>(NAMED_PRODUCT_IDS, [customerId])).rows.map((r) => r.product_id);
    },

    /** One list's rows, newest-added first. A default list never written to is empty. */
    async list(customerId, listRef) {
      const listId = await resolveList(db, customerId, listRef);
      if (!listId) return [];
      return (await db.query<ListRow>(LIST, [customerId, listId])).rows;
    },

    /**
     * The heart's un-save: take the product out of "Saved".
     *
     * ⚠ REFUSED, not carried out, when the product is in a named list (068 FR-020). A client that
     * predates lists believes the product is in exactly one list; carrying this out would leave it
     * saved elsewhere while that client draws it as un-saved. Removing an absent product is a no-op.
     */
    remove: (customerId, productId) =>
      locked(customerId, async (tx) => {
        if (await yes(tx, IN_NAMED_LIST, [customerId, productId])) throw new InNamedListsError();
        // The entry's foreign key cascades, so the default-list entry goes with the saved row.
        await tx.query(DELETE_SAVED, [customerId, productId]);
      }),

    /**
     * Fold a device's saved items into the account, in ONE transaction. `items` arrive newest
     * first, so when the cap bites it is the newest that are kept.
     */
    merge: (customerId, items, cap) =>
      locked(customerId, async (tx) => {
        let n = (await tx.query<{ n: number }>(COUNT_SAVED, [customerId])).rows[0]?.n ?? 0;
        let added = 0;
        const skipped: Skip[] = [];

        // ⚠ Device saves join "Saved" (068 FR-038). The default list is created only when there
        // is something to place in it.
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
            // Present already — the account's row and its price stand untouched. It still joins
            // "Saved": the shopper tapped its heart on this device, and it may so far be held only
            // in a named list. A no-op when it is already there.
            await place(it.productId, it.savedAt);
            continue;
          }
          if (!(await yes(tx, PRODUCT_EXISTS, [it.productId]))) {
            // ⚠ Skipped, never fatal. A merge must not fail wholesale because one product was
            // removed while the guest's list sat on their device.
            skipped.push({ productId: it.productId, reason: "not_found" });
            continue;
          }
          if (n >= cap) {
            skipped.push({ productId: it.productId, reason: "cap_reached" });
            continue;
          }
          await tx.query(MERGE_INSERT, [customerId, it.productId, it.savedPriceAmount, it.savedCurrency, iso(it.savedAt)]);
          await place(it.productId, it.savedAt);
          n += 1;
          added += 1;
        }

        const productIds = (await tx.query<{ product_id: string }>(MEMBERSHIP, [customerId])).rows.map((r) => r.product_id);
        return { added, skipped, productIds };
      }),

    /** Every list the shopper has, default first. A shopper with nothing saved has none. */
    async lists(customerId, productId) {
      return (await db.query<ListSummaryRow>(LISTS, [customerId, productId])).rows;
    },

    /** Create a named list and, when `productId` is given, place that product in it — atomically. */
    createList: (customerId, name, productId, listLimit, cap) =>
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
        if (productId) await addEntryTx(tx, customerId, id, productId, null, cap);
        return id;
      }),

    /** Rename a named list. The default list is refused, never treated as "not found". */
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
      // Deleted on another device between the read and the write.
      if (changed === 0) throw new ListNotFoundError();
    },

    /**
     * Delete a named list and un-save whatever it alone held. Idempotent: a list that does not
     * exist — or belongs to someone else — ends in the state the caller asked for.
     */
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

    /** Place a product in a list. Idempotent: an entry that exists is left exactly as it was. */
    addEntry: (customerId, listRef, productId, at, cap) =>
      locked(customerId, async (tx) => {
        const listId =
          listRef === DEFAULT_LIST_REF
            ? // The one place the default list comes into being, apart from the merge.
              (await tx.query<{ id: string }>(ENSURE_DEFAULT, [customerId])).rows[0]!.id
            : (await resolveList(tx, customerId, listRef))!;
        await addEntryTx(tx, customerId, listId, productId, at, cap);
      }),

    /** Take a product out of one list; un-save it if that was its last. Always succeeds. */
    removeEntry: (customerId, listRef, productId) =>
      locked(customerId, async (tx) => {
        let listId: string | null;
        try {
          listId = await resolveList(tx, customerId, listRef);
        } catch (err) {
          // The list is gone, so the product is not in it. Same end state.
          if (err instanceof ListNotFoundError) return;
          throw err;
        }
        if (!listId) return; // a default list that has never held anything
        await tx.query(DELETE_ENTRY, [listId, productId, customerId]);
        await tx.query(SWEEP_ORPHANS, [customerId]);
      }),
  };
}
