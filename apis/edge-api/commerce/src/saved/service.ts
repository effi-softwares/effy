// Why an item is unavailable is decided by the repository's query, so lists and bulk add agree.
import { imageWidthsField, publicImageAddress } from "@effy/edge-shared";
import {
  LIST_LIMIT, unitPrice,
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

/** Generous: it exists for abuse. Clients learn it from the refusal, not a copy of this number. */
export const ACCOUNT_CAP = 200;

export type CartAdder = (customerId: string, variantId: string, changeId: string, quantity: number) => Promise<unknown>;
export type ImageAddress = (storageKey: string | null | undefined) => Promise<string | null>;

/** RFC 3339 at second precision. */
const rfc3339 = (d: Date) => d.toISOString().replace(/\.\d{3}Z$/, "Z");

function badges(r: ListRow): ProductBadge[] {
  const out: ProductBadge[] = [];
  if (r.compare_at_amount !== null) out.push("on_sale");
  if (r.is_new) out.push("new");
  return out;
}

/** `priceDropped` and `categoryKey` are omitted when there is nothing to say. */
async function toItem(r: ListRow, imageAddress: ImageAddress): Promise<SavedItemDTO> {
  return {
    id: r.product_id,
    name: r.name,
    brand: r.brand,
    imageUrl: await imageAddress(r.storage_key),
    ...imageWidthsField(r.image_widths),
    priceAmount: r.price_amount,
    currency: r.currency,
    compareAtAmount: r.compare_at_amount,
    badges: badges(r),
    savedAt: rfc3339(r.saved_at),
    savedPriceAmount: r.saved_price_amount,
    ...(r.price_dropped ? { priceDropped: true } : {}),
    verdict: r.verdict as SavedVerdict,
    ...(r.category_key !== null ? { categoryKey: r.category_key } : {}),
    // The remembered size, else the only one; null means the shopper chooses.
    variantId: variantToAdd(r),
    variantLabel: r.variant_label,
    variantCount: r.variant_count,
    unitPrice: unitPrice(r.price_amount, r.pack_quantity, r.pack_unit, r.unit_basis),
  };
}

function variantToAdd(r: ListRow): string | null {
  if (r.variant_id) return r.variant_id;
  return r.variant_count === 1 ? r.shown_variant_id : null;
}

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

/** Carried through: "cart is full" and "out of stock" need different things from the shopper. */
function cartReason(err: unknown): string {
  if (err instanceof CartFullError) return "cart_full";
  if (err instanceof ProductUnavailableError) return "temporarily_unavailable";
  if (err instanceof CartProductNotFoundError) return "not_found";
  return "unavailable";
}

export function createSavedService(deps: { repo: SavedRepository; addToCart: CartAdder; imageAddress?: ImageAddress }) {
  const { repo, addToCart } = deps;
  const imageAddress = deps.imageAddress ?? publicImageAddress;

  async function listByid(customerId: string, id: string): Promise<SavedListDTO> {
    const row = (await repo.lists(customerId, null)).find((r) => r.id === id);
    if (!row) throw new ListNotFoundError();
    return toList(row, false);
  }

  const items = async (customerId: string, listRef: string) =>
    Promise.all((await repo.list(customerId, listRef)).map((r) => toItem(r, imageAddress)));
  const rowsOf = (customerId: string, listRef: string) => repo.list(customerId, listRef);

  return {
    async membership(customerId: string): Promise<SavedMembershipDTO> {
      const productIds = await repo.membershipIds(customerId);
      // Skipped for a shopper with nothing saved, which is most page loads.
      const namedProductIds = productIds.length > 0 ? await repo.namedProductIds(customerId) : [];
      return { productIds, count: productIds.length, namedProductIds };
    },

    list: items,

    /** `restoreSavedAt` is set only by undo. A malformed id is not found, not invalid. */
    async save(customerId: string, productId: string, restoreSavedAt: Date | null, variantId: string | null = null): Promise<void> {
      if (!isUuid(productId)) throw new ProductNotFoundError();
      await repo.addEntry(customerId, DEFAULT_LIST_REF, productId, restoreSavedAt, ACCOUNT_CAP, variantId);
    },

    async remove(customerId: string, productId: string): Promise<void> {
      if (!isUuid(productId)) return;
      await repo.remove(customerId, productId);
    },

    /** Newest first and stable, so when the cap bites the most recent survive. */
    async merge(customerId: string, incoming: readonly MergeItem[]): Promise<SavedMergeResultDTO> {
      const ordered = [...incoming].sort((a, b) => b.savedAt.getTime() - a.savedAt.getTime());
      const res = await repo.merge(customerId, ordered, ACCOUNT_CAP);
      return { added: res.added, skipped: res.skipped as SavedMergeResultDTO["skipped"], productIds: res.productIds };
    },

    /** Partial success is normal; each item's change id derives from the request, so retries add nothing twice. */
    async addAllToCart(customerId: string, listRef: string, changeId: string): Promise<SavedAddToCartResultDTO> {
      const res: SavedAddToCartResultDTO = { added: [], skipped: [] };
      for (const r of await rowsOf(customerId, listRef)) {
        if (r.verdict !== "purchasable") {
          res.skipped.push({ productId: r.product_id, reason: r.verdict as never });
          continue;
        }
        const variantId = variantToAdd(r);
        if (variantId === null) {
          res.skipped.push({ productId: r.product_id, reason: "choose_variant" });
          continue;
        }
        try {
          await addToCart(customerId, variantId, itemChangeId(changeId, r.product_id), 1);
          res.added.push(r.product_id);
        } catch (err) {
          res.skipped.push({ productId: r.product_id, reason: cartReason(err) as never });
        }
      }
      return res;
    },

    /** The default list is always present, synthesised when it has no row: a read never writes. */
    async lists(customerId: string, productId: string | null): Promise<SavedListDTO[]> {
      if (productId !== null && !isUuid(productId)) throw new ProductNotFoundError();
      const rows = await repo.lists(customerId, productId);
      const withProduct = productId !== null;
      const out = rows.map((r) => toList(r, withProduct));
      if (rows.length === 0 || !rows[0]!.is_default) out.unshift(toList(EMPTY_DEFAULT, withProduct));
      return out;
    },

    async createList(customerId: string, rawName: string, productId: string | null, variantId: string | null = null): Promise<SavedListDTO> {
      const name = normaliseListName(rawName);
      if (productId !== null && !isUuid(productId)) throw new ProductNotFoundError();
      return listByid(customerId, await repo.createList(customerId, name, productId, LIST_LIMIT, ACCOUNT_CAP, variantId));
    },

    /** The default list is refused before the name is checked. */
    async renameList(customerId: string, listRef: string, rawName: string): Promise<SavedListDTO> {
      if (listRef === DEFAULT_LIST_REF) throw new DefaultListError();
      const name = normaliseListName(rawName);
      await repo.renameList(customerId, listRef, name);
      return listByid(customerId, listRef);
    },

    deleteList: (customerId: string, listRef: string) => repo.deleteList(customerId, listRef),

    /** `restoreAddedAt` is set only by undo. */
    async addEntry(customerId: string, listRef: string, productId: string, restoreAddedAt: Date | null, variantId: string | null = null): Promise<void> {
      if (!isUuid(productId)) throw new ProductNotFoundError();
      await repo.addEntry(customerId, listRef, productId, restoreAddedAt, ACCOUNT_CAP, variantId);
    },

    async removeEntry(customerId: string, listRef: string, productId: string): Promise<void> {
      if (!isUuid(productId)) return;
      await repo.removeEntry(customerId, listRef, productId);
    },
  };
}

export type SavedService = ReturnType<typeof createSavedService>;
