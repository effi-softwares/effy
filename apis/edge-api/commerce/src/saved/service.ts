// Saved items (033) and named lists (068): business shaping. No HTTP, no SQL.
//
// The service does NOT decide why an item is unavailable — the repository's query does, from the
// product's status and stock, so the list and the bulk add-to-cart give the same explanation.
import { imageUrlOrNull } from "@effy/edge-shared";
import {
  LIST_LIMIT,
  type ProductBadge, type SavedAddToCartResultDTO, type SavedItemDTO, type SavedListDTO, type SavedMembershipDTO,
  type SavedMergeResultDTO, type SavedVerdict,
} from "@effy/shared-types";

import { CartFullError, ProductNotFoundError as CartProductNotFoundError, ProductUnavailableError } from "../cart/service";
import { isUuid } from "../lib/ids";
import { itemChangeId } from "./change-id";
import { normaliseListName } from "./list-name";
import {
  DEFAULT_LIST_REF, DefaultListError, ListNotFoundError, ProductNotFoundError,
  type ListRow, type ListSummaryRow, type MergeItem, type SavedRepository,
} from "./repository";

/**
 * The platform's ceiling on DISTINCT saved products per account (033 FR-047). Generous — it exists
 * for abuse, not ordinary use. The server is authoritative: a client learns the cap from the
 * refusal, not from a copy of this number. (The list limit and name length ARE shared constants,
 * imported from `@effy/shared-types`, because clients count toward those in advance.)
 */
export const ACCOUNT_CAP = 200;

/** What bulk add-to-cart needs from the cart: add one unit, idempotently, or throw the refusal. */
export type CartAdder = (customerId: string, productId: string, changeId: string, quantity: number) => Promise<unknown>;
export type Presign = (storageKey: string | null | undefined) => Promise<string | null>;

/** RFC 3339 at second precision — the form these timestamps have always had on the wire. */
const rfc3339 = (d: Date) => d.toISOString().replace(/\.\d{3}Z$/, "Z");

function badges(r: ListRow): ProductBadge[] {
  const out: ProductBadge[] = [];
  if (r.compare_at_amount !== null) out.push("on_sale");
  if (r.is_new) out.push("new");
  return out;
}

/**
 * ⚠ `priceDropped` and `categoryKey` are OMITTED, not null, when there is nothing to say. Absent
 * means "no drop"; there is deliberately no `priceRose` counterpart (033 FR-044).
 */
async function toItem(r: ListRow, presign: Presign): Promise<SavedItemDTO> {
  return {
    id: r.product_id,
    name: r.name,
    brand: r.brand,
    imageUrl: await presign(r.storage_key),
    priceAmount: r.price_amount,
    currency: r.currency,
    compareAtAmount: r.compare_at_amount,
    badges: badges(r),
    savedAt: rfc3339(r.saved_at),
    savedPriceAmount: r.saved_price_amount,
    ...(r.price_dropped ? { priceDropped: true } : {}),
    verdict: r.verdict as SavedVerdict,
    ...(r.category_key !== null ? { categoryKey: r.category_key } : {}),
  };
}

/** `containsProduct` appears only when the read named a product. */
function toList(r: ListSummaryRow, withProduct: boolean): SavedListDTO {
  return {
    id: r.is_default ? DEFAULT_LIST_REF : r.id,
    isDefault: r.is_default,
    name: r.name,
    count: r.count,
    onlyHereCount: r.only_here,
    ...(withProduct ? { containsProduct: r.contains } : {}),
  };
}

const EMPTY_DEFAULT: ListSummaryRow = { id: "", is_default: true, name: null, count: 0, only_here: 0, contains: false };

/**
 * The cart's refusal, carried through rather than flattened: "your cart is full" and "that is out
 * of stock" need different things from the shopper.
 */
function cartReason(err: unknown): string {
  if (err instanceof CartFullError) return "cart_full";
  if (err instanceof ProductUnavailableError) return "temporarily_unavailable";
  if (err instanceof CartProductNotFoundError) return "not_found";
  return "unavailable";
}

export function createSavedService(deps: { repo: SavedRepository; addToCart: CartAdder; presign?: Presign }) {
  const { repo, addToCart } = deps;
  const presign = deps.presign ?? imageUrlOrNull;

  async function listByid(customerId: string, id: string): Promise<SavedListDTO> {
    const row = (await repo.lists(customerId, null)).find((r) => r.id === id);
    // Deleted on another device between the write and this read.
    if (!row) throw new ListNotFoundError();
    return toList(row, false);
  }

  const items = async (customerId: string, listRef: string) =>
    Promise.all((await repo.list(customerId, listRef)).map((r) => toItem(r, presign)));

  return {
    /** What every heart on a screen is filled from: one read answers them all (033 FR-021). */
    async membership(customerId: string): Promise<SavedMembershipDTO> {
      const productIds = await repo.membershipIds(customerId);
      // A second statement, skipped for a shopper with nothing saved — which is most page loads.
      const namedProductIds = productIds.length > 0 ? await repo.namedProductIds(customerId) : [];
      return { productIds, count: productIds.length, namedProductIds };
    },

    /** One list's items, newest-added first. `listRef` is a list id or "default". */
    list: items,

    /**
     * Save a product ("default" list). Idempotent. `restoreSavedAt` is only ever set by undo, to
     * put the item back where it was. A malformed id names no product: not found, not invalid.
     */
    async save(customerId: string, productId: string, restoreSavedAt: Date | null): Promise<void> {
      if (!isUuid(productId)) throw new ProductNotFoundError();
      await repo.addEntry(customerId, DEFAULT_LIST_REF, productId, restoreSavedAt, ACCOUNT_CAP);
    },

    /** The heart's un-save. A malformed id names no membership, so there is nothing to remove. */
    async remove(customerId: string, productId: string): Promise<void> {
      if (!isUuid(productId)) return;
      await repo.remove(customerId, productId);
    },

    /**
     * Fold a device's guest list into the account. Newest-first, so if the cap bites it is the most
     * recent intent that survives; the sort is stable, so equal timestamps keep the device's order.
     */
    async merge(customerId: string, incoming: readonly MergeItem[]): Promise<SavedMergeResultDTO> {
      const ordered = [...incoming].sort((a, b) => b.savedAt.getTime() - a.savedAt.getTime());
      const res = await repo.merge(customerId, ordered, ACCOUNT_CAP);
      return { added: res.added, skipped: res.skipped as SavedMergeResultDTO["skipped"], productIds: res.productIds };
    },

    /**
     * Add every PURCHASABLE item of a list to the cart; report what was skipped and why.
     *
     * Neither an error nor an all-or-nothing operation: this lists 200 items and adds them one at
     * a time, so being partway through is a normal state. A second attempt with the same change id
     * adds nothing twice, because each item's id is derived from it.
     */
    async addAllToCart(customerId: string, listRef: string, changeId: string): Promise<SavedAddToCartResultDTO> {
      const res: SavedAddToCartResultDTO = { added: [], skipped: [] };
      for (const it of await items(customerId, listRef)) {
        if (it.verdict !== "purchasable") {
          // The verdict IS the reason — the same thing the list already says about the item.
          res.skipped.push({ productId: it.id, reason: it.verdict as never });
          continue;
        }
        try {
          await addToCart(customerId, it.id, itemChangeId(changeId, it.id), 1);
          res.added.push(it.id);
        } catch (err) {
          res.skipped.push({ productId: it.id, reason: cartReason(err) as never });
        }
      }
      return res;
    },

    /**
     * Every list the shopper has, default first.
     *
     * ⚠ The default list is ALWAYS in the answer: when no row exists yet it is synthesised, empty.
     * A read never writes — which is what lets the mobile app warm its cache from this call without
     * creating a row for every shopper who merely opens it.
     */
    async lists(customerId: string, productId: string | null): Promise<SavedListDTO[]> {
      if (productId !== null && !isUuid(productId)) throw new ProductNotFoundError();
      const rows = await repo.lists(customerId, productId);
      const withProduct = productId !== null;
      const out = rows.map((r) => toList(r, withProduct));
      if (rows.length === 0 || !rows[0]!.is_default) out.unshift(toList(EMPTY_DEFAULT, withProduct));
      return out;
    },

    /** Create a named list and, when a product is given, place it there in the same step. */
    async createList(customerId: string, rawName: string, productId: string | null): Promise<SavedListDTO> {
      const name = normaliseListName(rawName);
      if (productId !== null && !isUuid(productId)) throw new ProductNotFoundError();
      return listByid(customerId, await repo.createList(customerId, name, productId, LIST_LIMIT, ACCOUNT_CAP));
    },

    /**
     * Rename a named list. The default is refused BEFORE the name is looked at: "you cannot rename
     * this" outranks "that name is too long".
     */
    async renameList(customerId: string, listRef: string, rawName: string): Promise<SavedListDTO> {
      if (listRef === DEFAULT_LIST_REF) throw new DefaultListError();
      const name = normaliseListName(rawName);
      await repo.renameList(customerId, listRef, name);
      return listByid(customerId, listRef);
    },

    deleteList: (customerId: string, listRef: string) => repo.deleteList(customerId, listRef),

    /** Place a product in a list. `restoreAddedAt` is only ever set by undo. */
    async addEntry(customerId: string, listRef: string, productId: string, restoreAddedAt: Date | null): Promise<void> {
      if (!isUuid(productId)) throw new ProductNotFoundError();
      await repo.addEntry(customerId, listRef, productId, restoreAddedAt, ACCOUNT_CAP);
    },

    /** Take a product out of one list. Always succeeds. */
    async removeEntry(customerId: string, listRef: string, productId: string): Promise<void> {
      if (!isUuid(productId)) return;
      await repo.removeEntry(customerId, listRef, productId);
    },
  };
}

export type SavedService = ReturnType<typeof createSavedService>;
