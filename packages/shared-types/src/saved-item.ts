/**
 * Saved items: the shopper's price-and-availability watchlist. `SavedMembershipDTO` answers "is this
 * saved?" once per screen; `SavedVerdict` says whether each item can be bought. Not the cart's set-aside
 * (`cart.ts`).
 */
import type { WireInt } from "./cart";
import type { ProductBadge } from "./storefront";
import type { UnitPriceDTO } from "./unit-price";

/**
 * Whether the shopper can buy a saved item now, each value implying a next action:
 *  purchasable → buy now
 *  temporarily_unavailable → sold, not in stock: wait
 *  no_longer_sold → withdrawn: give up
 */
export type SavedVerdict =
  | "purchasable"
  | "temporarily_unavailable"
  | "no_longer_sold";

/**
 * One entry in the saved list. Name, image and current price are read live; only `savedPriceAmount` is
 * remembered, so a drop is detectable. It does not extend `StorefrontProductCardDTO`: that card's
 * `available` flag is catalogue status only, and `verdict` replaces it, so the card fields are repeated.
 */
export interface SavedItemDTO {
  id: string;
  name: string;
  brand: string | null;
  imageUrl: string | null;
  /** Widths (px) of this picture's smaller copies, ascending; absent or [] means only `imageUrl`. Build each with `renditionUrl`. */
  imageWidths?: number[];
  priceAmount: string;
  currency: string;
  compareAtAmount: string | null;
  badges: ProductBadge[];
  /** When it was saved: list order (newest first) and undo's restore position. */
  savedAt: string;
  /** The price when saved: the baseline for `priceDropped`. */
  savedPriceAmount: string;
  /** Present and `true` only when the current price is below the save-time price. No `priceRose`: a rise is not actionable. */
  priceDropped?: boolean;
  verdict: SavedVerdict;
  /** For grouping by aisle; absent when the product has no primary category. */
  categoryKey?: string;
  /**
   * The variant "Add to cart" adds: the one remembered when saved, else the product's only one. Null when
   * there are several sizes and none is remembered (or it is no longer sold): the shopper chooses. Price,
   * verdict and image are the remembered variant's when there is one.
   */
  variantId: string | null;
  /** Its label ("1 kg"); null when none, or with no options. */
  variantLabel: string | null;
  /** More than one active variant: adding without a remembered one asks the shopper to choose. */
  variantCount: WireInt;
  unitPrice: UnitPriceDTO | null;
}

/** PUT /commerce/v1/saved/{productId}: save (idempotent). `variantId` remembers the selected variant; saving again updates it. */
export interface SaveItemRequest {
  /** Set only by undo. */
  restoreSavedAt?: string;
  variantId?: string | null;
}

/**
 * The shopper's whole set of saved product ids, fetched once per screen and answering for every product
 * on it (catalogue reads stay shopper-neutral). The 200-item cap keeps it cheap.
 */
export interface SavedMembershipDTO {
  productIds: string[];
  /** `WireInt`. */
  count: WireInt;
  /**
   * The ids also held in a named list. A tap on a filled heart un-saves a product only in "Saved"; one in
   * a named list opens the list chooser (the platform refuses the removal with 409 anyway).
   */
  namedProductIds: string[];
}

/** One device-held saved item offered to an account. */
export interface SavedMergeItem {
  productId: string;
  /** The variant the device remembered, if any. */
  variantId?: string | null;
  /**
   * The guest's save-time price travels with it, so the watchlist keeps the movement. Absent means the
   * device never saw a price: the platform then uses the current price, as an ordinary save does (never
   * send "0").
   */
  savedPriceAmount: string | null;
  savedCurrency: string | null;
  savedAt: string;
}

export interface SavedMergeRequest {
  items: SavedMergeItem[];
}

/** Why one product could not be taken (a merge or a bulk add). */
export interface SavedSkip {
  productId: string;
  /** `cap_reached` | `not_found` | a `SavedVerdict` | a cart refusal reason | `choose_variant` (open the product and choose). */
  reason: string;
}

/**
 * The result of joining a device-held list into an account: the resulting set (so the client seeds its
 * store from it) and `added`, so the surface discloses the join by count.
 */
export interface SavedMergeResultDTO {
  /** `WireInt`. */
  added: WireInt;
  skipped: SavedSkip[];
  productIds: string[];
}

export interface SavedAddToCartRequest {
  changeId?: string;
}

/** The result of adding every purchasable saved item to the cart. Every omission is in `skipped`, with a reason. */
export interface SavedAddToCartResultDTO {
  added: string[];
  skipped: SavedSkip[];
}

// Lists the shopper names

/** How many lists of their own a shopper may hold, the default excluded. */
export const LIST_LIMIT = 20;

/** The longest list name, in Unicode code points after normalisation; advisory for a remaining-characters count (the platform answers `invalid_name`). */
export const LIST_NAME_MAX = 40;

/** The default list's id on the wire. No client ever needs its real id. */
export const DEFAULT_LIST_ID = "default";

/** One of the shopper's lists. `name` is `null` for the default list ("Saved" is each client's display text). */
export interface SavedListDTO {
  /** A uuid, or `"default"` for the default list. */
  id: string;
  isDefault: boolean;
  name: string | null;
  count: WireInt;
  /** How many of this list's products are in no other list: deleting it unsaves them, and the confirmation says so. */
  onlyHereCount: WireInt;
  /** Present only when the read named a product: whether this list holds it. */
  containsProduct?: boolean;
}

export interface SavedListCreateRequest {
  name: string;
  /** Place this product in the new list in the same action. */
  productId?: string;
  /** With `productId`: the variant to remember. */
  variantId?: string | null;
}

export interface SavedListRenameRequest {
  name: string;
}

export interface SavedListEntryRequest {
  /** Set only by undo, to return the product to its position in this list. */
  restoreAddedAt?: string;
  /** The variant the shopper had selected; it becomes the remembered one. */
  variantId?: string | null;
}

/**
 * Why the platform refused a list request. A closed set; clients switch on these and nothing else.
 * Carried as the last path segment of the problem's `type`, with `_` written as `-`.
 */
export type SavedListRefusal =
  | "name_taken"
  | "invalid_name"
  | "list_limit"
  | "default_list"
  | "list_not_found"
  | "in_named_lists"
  | "saved_items_cap_reached";
