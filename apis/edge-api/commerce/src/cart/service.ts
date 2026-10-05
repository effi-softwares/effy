// Service layer: cart business rules — no HTTP, no SQL. The server cart is the source of truth for
// a signed-in shopper and the ONLY cart the charge is computed from; a guest cart lives on the
// device and is re-priced through `preview`.
//
// The rules that keep it safe (019 R8, extended by 027):
//   - prices are RE-READ from public.product on every read — never carried from the client;
//   - a line that is no longer PURCHASABLE (withdrawn, or the shop has run out — 054) is surfaced
//     but EXCLUDED from every total (FR-006, FR-017);
//   - the two ceilings and the minimum come from public.order_policy;
//   - every mutation is idempotent or carries a change id — see repository.ts;
//   - the applied promotion is re-evaluated on every read and never stored as an amount.
import {
  CURRENCY, emitMetric, formatCents, imageUrlOrNull, metricNamespace, outOfStock, parseCents, purchasable,
} from "@effy/edge-shared";
import { hasMinimum, meetsMinimum, remainingToMinimum, type CartPolicy } from "@effy/edge-shared/cart-policy";
import type {
  CartCheckoutStateDTO, CartDiscountDTO, CartDTO, CartLineDTO, CartNoticeDTO, ReorderResultDTO, ReorderSkippedDTO,
} from "@effy/shared-types";

import { isUuid } from "../lib/ids";
import { evaluatePromo, lapsedDetail, normalisePromoCode, promoLabel, PromoRefusedError, type PromoCode } from "../promo/promo";
import { packageKey } from "./package-key";
import type { CartLineRow, CartRepository } from "./repository";

const STATUS_ARCHIVED = "archived";

/** The domain refusals a cart operation can end in. The handler maps each to its response. */
export class ProductNotFoundError extends Error {}
export class ProductUnavailableError extends Error {}
export class CartFullError extends Error {}
/** Raised for a missing order AND for someone else's — never distinguishable. */
export class OrderNotFoundError extends Error {}

/**
 * The shop cannot supply the quantity asked for (054 FR-016). It carries how many it CAN, because
 * "that is unavailable" leaves a shopper with nothing to do and "only 2 available" lets them take
 * the two (FR-015b). Deliberately distinct from `ProductUnavailableError`: that means none.
 */
export class InsufficientStockError extends Error {
  constructor(readonly productId: string, readonly available: number) {
    super(`cart: only ${available} available`);
  }
}

export interface LineInput {
  productId: string;
  quantity: number;
}

export type Presign = (storageKey: string | null | undefined) => Promise<string | null>;
export type PolicyReader = () => Promise<CartPolicy>;

const clampTo = (qty: number, max: number): number => (qty < 1 ? 1 : qty > max ? max : qty);
const quantityOf = (rows: readonly CartLineRow[], productId: string) => rows.find((r) => r.product_id === productId)?.quantity ?? 0;
const containsProduct = (rows: readonly CartLineRow[], productId: string) => rows.some((r) => r.product_id === productId);
const isPurchasable = (r: Pick<CartLineRow, "status" | "stock_tracked" | "stock_on_hand">) =>
  purchasable(r.status, r.stock_tracked, r.stock_on_hand);

/**
 * WHY a line cannot be bought, in words a shopper can act on (054 FR-014). Never names or implies a
 * shop: it says what happened to the PRODUCT.
 */
function unavailableDetail(row: CartLineRow): string {
  if (row.status === STATUS_ARCHIVED) return `${row.name} is no longer sold`;
  if (outOfStock(row.status, row.stock_tracked, row.stock_on_hand)) return `${row.name} is out of stock`;
  return `${row.name} is unavailable right now`;
}

/**
 * Collapse duplicate product ids (summing, then clamping to the per-line ceiling) and drop
 * malformed or non-positive entries. First-seen order is preserved.
 */
export function dedupe(lines: readonly LineInput[], max: number): { ids: string[]; qty: Map<string, number> } {
  const qty = new Map<string, number>();
  const ids: string[] = [];
  for (const l of lines) {
    if (!Number.isInteger(l.quantity) || l.quantity <= 0 || !isUuid(l.productId)) continue;
    if (!qty.has(l.productId)) ids.push(l.productId);
    qty.set(l.productId, (qty.get(l.productId) ?? 0) + l.quantity);
  }
  for (const [id, q] of qty) qty.set(id, clampTo(q, max));
  return { ids, qty };
}

/**
 * The PAYABLE subtotal of a set of line rows — the base a promotion and the minimum are judged on.
 *
 * ⚠ 054 FR-017: a line the shop cannot supply is excluded, and a partly-supplied line counts only
 * what can be supplied. This is the one place that decides what a shopper is asked to pay.
 */
export function payableCents(rows: readonly CartLineRow[]): number {
  let total = 0;
  for (const row of rows) {
    if (!isPurchasable(row)) continue;
    total += parseCents(row.unit_price_amount) * suppliableQuantity(row);
  }
  return total;
}

/** The quantity the shop can actually supply for a line: the asked quantity, capped at stock. */
function suppliableQuantity(row: CartLineRow): number {
  const capped = row.stock_tracked && row.stock_on_hand !== null && row.stock_on_hand < row.quantity
    ? row.stock_on_hand
    : row.quantity;
  return Math.max(0, capped);
}

/**
 * Whether checkout may proceed and, if not, why. Authoritative here and enforced again at intent.
 *
 * ⚠ Judged on the PAYABLE total after any discount: that is the amount actually being charged.
 */
export function checkoutState(lineCount: number, payableLines: number, payable: number, policy: CartPolicy): CartCheckoutStateDTO {
  const minimum = hasMinimum(policy) ? formatCents(policy.minimumSubtotalCents) : null;
  if (lineCount === 0) return { allowed: false, blockedReason: "empty", minimumSubtotalAmount: minimum, remainingAmount: null };
  if (payableLines === 0) return { allowed: false, blockedReason: "no_payable_items", minimumSubtotalAmount: minimum, remainingAmount: null };
  if (!meetsMinimum(policy, payable)) {
    return {
      allowed: false, blockedReason: "below_minimum", minimumSubtotalAmount: minimum,
      remainingAmount: formatCents(remainingToMinimum(policy, payable)),
    };
  }
  return { allowed: true, blockedReason: null, minimumSubtotalAmount: minimum, remainingAmount: null };
}

export function createCartService(deps: {
  repo: CartRepository;
  policy: PolicyReader;
  presign?: Presign;
  now?: () => Date;
}) {
  const { repo, policy } = deps;
  const presign = deps.presign ?? imageUrlOrNull;
  const now = deps.now ?? (() => new Date());

  /** Rows → wire lines, the payable subtotal, and (optionally) the notices they raise. */
  async function toLines(rows: readonly CartLineRow[], collectNotices: boolean) {
    const notices: CartNoticeDTO[] = [];
    let subtotalCents = 0;

    const lines = await Promise.all(
      rows.map(async (row): Promise<CartLineDTO> => {
        const available = isPurchasable(row);
        const unitCents = parseCents(row.unit_price_amount);

        // ⚠ 054 FR-017: the PRESENTED quantity is capped at what the shop can supply, and the
        // subtotal is computed from that capped number. Leaving the quantity at 5 while charging
        // for 2 makes lineSubtotal != unitPrice × quantity — lines that do not add up, which every
        // surface that renders a cart would get wrong differently. The cart ROW is untouched: if
        // stock returns, so does the 5.
        const payableQty = suppliableQuantity(row);
        const lineCents = unitCents * payableQty;

        // A price change is only reportable when we recorded what it was.
        const changedFrom = row.unit_price_at_add !== null && row.unit_price_at_add !== row.unit_price_amount
          ? row.unit_price_at_add
          : null;

        return {
          id: row.id,
          productId: row.product_id,
          name: row.name,
          imageUrl: await presign(row.storage_key),
          unitPriceAmount: row.unit_price_amount,
          quantity: payableQty,
          lineSubtotalAmount: formatCents(lineCents),
          available,
          priceChangedFrom: changedFrom,
          packageKey: packageKey(row.shop_id),
        };
      }),
    );

    // Notices and the subtotal are built in row order, after the (order-preserving) mapping above.
    rows.forEach((row, i) => {
      const line = lines[i]!;
      if (collectNotices && line.priceChangedFrom !== null) {
        notices.push({ productId: row.product_id, kind: "price_changed", detail: row.name });
      }
      if (line.available) {
        subtotalCents += parseCents(line.lineSubtotalAmount);
        // Partially supplied: told, not silently reduced (FR-017).
        if (collectNotices && line.quantity < row.quantity) {
          notices.push({ productId: row.product_id, kind: "quantity_clamped", detail: `Only ${line.quantity} of ${row.name} available` });
        }
      } else if (collectNotices) {
        // ⚠ ONE NOTICE KIND, TWO CAUSES, AND THE CAUSE IS IN THE DETAIL (FR-014). "Out of stock"
        // and "no longer sold" ask different things of a shopper — wait, versus give up.
        notices.push({ productId: row.product_id, kind: "unavailable", detail: unavailableDetail(row) });
      }
    });

    return { lines, subtotalCents, notices };
  }

  /**
   * The applied promotion's current worth, or a notice that it stopped applying.
   *
   * Usage is not re-counted here: the caps were checked when the code was applied, and a read is
   * not the moment to prove a cap the shopper cannot have moved by looking at their cart. The
   * authoritative check happens again at checkout, where it matters.
   */
  async function discountOf(cartId: string, payable: number) {
    const meta = await repo.meta(cartId);
    if (!meta.promoCodeId) return { discount: null, cents: 0, notices: [] as CartNoticeDTO[] };
    const code = await repo.promoById(meta.promoCodeId);
    if (!code) return { discount: null, cents: 0, notices: [] as CartNoticeDTO[] };

    const result = evaluatePromo(code, { total: 0, byThisShopper: 0 }, payable, now());
    if (!result.ok) {
      // Cart-level: productId is null. The code stays on the cart, so it starts applying again by
      // itself if the cart recovers.
      return {
        discount: null, cents: 0,
        notices: [{ productId: null, kind: "promo_no_longer_applies", detail: lapsedDetail(result.reason, code) }] as CartNoticeDTO[],
      };
    }
    const discount: CartDiscountDTO = {
      code: code.code, kind: code.kind as CartDiscountDTO["kind"],
      amount: formatCents(result.discountCents), label: promoLabel(code),
    };
    return { discount, cents: result.discountCents, notices: [] as CartNoticeDTO[] };
  }

  /** Turn line rows into the wire cart. The one place cart totals are computed. */
  async function assemble(input: {
    cartId: string | null;
    lineRows: readonly CartLineRow[];
    savedRows?: readonly CartLineRow[];
    revision?: number;
    policy: CartPolicy;
    extra?: readonly CartNoticeDTO[];
    /** Delete archived lines from the server cart (never for a preview: there is none). */
    sweep: boolean;
  }): Promise<CartDTO> {
    const notices: CartNoticeDTO[] = [...(input.extra ?? [])];

    // An `archived` product is terminal — sweep the line rather than leaving a shopper looking at
    // something they can never buy. `unavailable`/`draft` are kept and flagged.
    const archived: string[] = [];
    const kept: CartLineRow[] = [];
    for (const row of input.lineRows) {
      if (row.status === STATUS_ARCHIVED) {
        archived.push(row.product_id);
        notices.push({ productId: row.product_id, kind: "removed", detail: row.name });
      } else {
        kept.push(row);
      }
    }
    const swept = input.sweep && input.cartId !== null && archived.length > 0;
    if (swept) await repo.deleteLines(input.cartId!, archived);

    const payable = await toLines(kept, true);
    notices.push(...payable.notices);

    // Saved lines are shown honestly but contribute to NOTHING. Their notices are omitted on
    // purpose: a cart-level warning about something explicitly set aside is noise.
    const saved = await toLines(input.savedRows ?? [], false);

    // A sweep mutates, so it advances the revision by exactly one — cheaper than another read.
    const revision = (input.revision ?? 0) + (swept ? 1 : 0);

    let discount: CartDiscountDTO | null = null;
    let discountCents = 0;
    if (input.cartId !== null) {
      const d = await discountOf(input.cartId, payable.subtotalCents);
      discount = d.discount;
      discountCents = d.cents;
      notices.push(...d.notices);
    }
    const grandCents = payable.subtotalCents - discountCents;

    return {
      revision,
      lines: payable.lines,
      savedLines: saved.lines,
      itemSubtotalAmount: formatCents(payable.subtotalCents),
      discountAmount: formatCents(discountCents),
      grandTotalAmount: formatCents(grandCents),
      currency: CURRENCY,
      notices,
      discount,
      checkout: checkoutState(payable.lines.length, payable.lines.filter((l) => l.available).length, grandCents, input.policy),
      limits: { maxLineQuantity: input.policy.maxLineQuantity, maxDistinctItems: input.policy.maxDistinctItems },
    };
  }

  /** Read the cart and assemble it. */
  async function build(cartId: string, cartPolicy?: CartPolicy, extra?: readonly CartNoticeDTO[]): Promise<CartDTO> {
    const p = cartPolicy ?? (await policy());
    const all = await repo.allLines(cartId);
    return assemble({ cartId, lineRows: all.lines, savedRows: all.saved, revision: all.revision, policy: p, extra, sweep: true });
  }

  /** The product exists and can be bought right now. */
  async function assertPurchasable(productId: string): Promise<void> {
    if (!isUuid(productId)) throw new ProductNotFoundError();
    const prod = await repo.productStatus(productId);
    if (!prod) throw new ProductNotFoundError();
    if (!isPurchasable(prod)) throw new ProductUnavailableError();
  }

  /**
   * The shop can supply `want` units — the line's RESULTING quantity, not the increment.
   *
   * ⚠ THIS IS THE CART'S HALF OF THE DEFENCE, and it is advisory. Two shoppers can both pass it for
   * the last unit; the binding check is the locked deduction at payment. This exists so the shopper
   * is told BEFORE the payment step, in the place they can do something about it.
   */
  async function assertCanTake(productId: string, want: number): Promise<void> {
    if (!isUuid(productId)) throw new ProductNotFoundError();
    const prod = await repo.productStatus(productId);
    if (!prod) throw new ProductNotFoundError();
    if (!isPurchasable(prod)) throw new ProductUnavailableError();
    if (prod.stock_tracked && prod.stock_on_hand !== null && want > prod.stock_on_hand) {
      emitMetric(metricNamespace(), "StockBlocked", 1, { stage: "add" });
      throw new InsufficientStockError(productId, prod.stock_on_hand);
    }
  }

  const clampNotice = (productId: string, max: number): CartNoticeDTO => ({
    productId, kind: "quantity_clamped", detail: `Limited to ${max} per item`,
  });

  return {
    /** The priced cart (creating an empty one on first use). */
    async get(customerId: string): Promise<CartDTO> {
      return build(await repo.getOrCreateCartId(customerId));
    },

    /** The order rules a GUEST cart needs — there is no server cart to read them from. */
    policy,

    /**
     * Re-price a guest's device cart and report what changed, WITHOUT writing anything. This is
     * what makes "restore with current prices and availability" true for guests too. The
     * distinct-item ceiling is applied here, since no table constraint is in play.
     */
    async preview(lines: readonly LineInput[]): Promise<CartDTO> {
      const p = await policy();
      const { ids, qty } = dedupe(lines, p.maxLineQuantity);
      const wanted = ids.slice(0, p.maxDistinctItems);

      const byId = new Map((await repo.productSnapshots(wanted)).map((r) => [r.product_id, r]));
      const ordered: CartLineRow[] = [];
      const notices: CartNoticeDTO[] = [];
      for (const id of wanted) {
        const row = byId.get(id.toLowerCase()) ?? byId.get(id);
        if (!row) notices.push({ productId: id, kind: "removed", detail: null });
        else ordered.push({ ...row, quantity: qty.get(id)! });
      }
      return assemble({ cartId: null, lineRows: ordered, policy: p, extra: notices, sweep: false });
    },

    /** Increment a line. The one non-idempotent operation, so `changeId` is required. */
    async add(customerId: string, productId: string, changeId: string, qty: number): Promise<CartDTO> {
      const p = await policy();
      const cartId = await repo.getOrCreateCartId(customerId);

      // The ceiling applies to DISTINCT products, so incrementing something already in the cart is
      // always allowed — being full must not stop a shopper adjusting what they already chose.
      const existing = await repo.lines(cartId);
      if (!containsProduct(existing, productId) && existing.length >= p.maxDistinctItems) throw new CartFullError();

      // ⚠ 054: the stock check is on the RESULTING line quantity. Adding 2 to a line holding 4 asks
      // the shop for 6; checking only the increment would let a shopper walk a line past the shelf
      // two taps at a time.
      const held = quantityOf(existing, productId);
      await assertCanTake(productId, held + qty);

      const clamped = clampTo(qty, p.maxLineQuantity);
      const applied = await repo.addItem(cartId, productId, changeId, clamped, p.maxLineQuantity);

      // A duplicate change id means this exact action already happened: report nothing new.
      const wasClamped = qty !== clamped || (containsProduct(existing, productId) && held + clamped > p.maxLineQuantity);
      return build(cartId, p, applied && wasClamped ? [clampNotice(productId, p.maxLineQuantity)] : []);
    },

    /** Set an ABSOLUTE quantity; zero or less removes the line. Safe to repeat. */
    async setQty(customerId: string, productId: string, changeId: string, qty: number): Promise<CartDTO> {
      if (!isUuid(productId)) throw new ProductNotFoundError();
      const p = await policy();
      const cartId = await repo.getOrCreateCartId(customerId);

      if (qty <= 0) {
        await repo.removeItem(cartId, productId, changeId);
        return build(cartId, p);
      }

      // An absolute set asks for exactly `qty`, so that is what the shop must be able to supply.
      await assertCanTake(productId, qty);

      const clamped = clampTo(qty, p.maxLineQuantity);
      const applied = await repo.setQty(cartId, productId, changeId, clamped);
      return build(cartId, p, applied && clamped !== qty ? [clampNotice(productId, p.maxLineQuantity)] : []);
    },

    /** Delete a line. Removing something already gone is a no-op, not an error. */
    async remove(customerId: string, productId: string, changeId: string): Promise<CartDTO> {
      if (!isUuid(productId)) throw new ProductNotFoundError();
      const cartId = await repo.getOrCreateCartId(customerId);
      await repo.removeItem(cartId, productId, changeId);
      return build(cartId);
    },

    /** Empty the payable cart. Set-aside lines survive. */
    async clear(customerId: string, changeId: string): Promise<CartDTO> {
      const cartId = await repo.getOrCreateCartId(customerId);
      await repo.deleteAllItems(cartId, changeId);
      return build(cartId);
    },

    /**
     * Fold a device cart into the account cart at sign-in: a UNION with the MAXIMUM quantity
     * (027 FR-009). Nothing already in the account cart is removed, and repeating it changes
     * nothing — the same items on two devices must not double.
     */
    async merge(customerId: string, changeId: string, lines: readonly LineInput[]): Promise<CartDTO> {
      const p = await policy();
      const cartId = await repo.getOrCreateCartId(customerId);
      const { ids, qty } = dedupe(lines, p.maxLineQuantity);

      // Keep only products that still exist and are not archived. An `unavailable` product IS
      // merged: the shopper chose it, and it must arrive flagged, not disappeared.
      const kept: string[] = [];
      for (const id of ids) {
        const prod = await repo.productStatus(id);
        if (prod && prod.status !== STATUS_ARCHIVED) kept.push(id);
      }

      // Respect the distinct-item ceiling across the merged result: something already in the cart
      // does not consume room; anything new is dropped once it is full.
      const existing = await repo.lines(cartId);
      let room = p.maxDistinctItems - existing.length;
      const mergeIds = kept.filter((id) => containsProduct(existing, id) || room-- > 0);

      await repo.mergeItems(cartId, changeId, mergeIds, mergeIds.map((id) => qty.get(id)!), p.maxLineQuantity);
      return build(cartId, p);
    },

    /** Move a line to "saved for later". It leaves the payable totals immediately. */
    async setAside(customerId: string, productId: string, changeId: string): Promise<CartDTO> {
      if (!isUuid(productId)) throw new ProductNotFoundError();
      const cartId = await repo.getOrCreateCartId(customerId);
      await repo.setAside(cartId, productId, changeId);
      return build(cartId);
    },

    /**
     * Move a set-aside line back into the payable cart. Gated on purchasability, like add: a
     * shopper must not be able to route an unavailable product into a payable cart by way of the
     * saved list.
     */
    async restoreSaved(customerId: string, productId: string, changeId: string): Promise<CartDTO> {
      await assertPurchasable(productId);
      const p = await policy();
      const cartId = await repo.getOrCreateCartId(customerId);
      const existing = await repo.lines(cartId);
      if (!containsProduct(existing, productId) && existing.length >= p.maxDistinctItems) throw new CartFullError();
      await repo.restoreSaved(cartId, productId, changeId, p.maxLineQuantity);
      return build(cartId, p);
    },

    async deleteSaved(customerId: string, productId: string, changeId: string): Promise<CartDTO> {
      if (!isUuid(productId)) throw new ProductNotFoundError();
      const cartId = await repo.getOrCreateCartId(customerId);
      await repo.deleteSaved(cartId, productId, changeId);
      return build(cartId);
    },

    /**
     * Put a past order's items back into the cart: a UNION with the MAXIMUM quantity, at CURRENT
     * prices — never the prices that order was charged. Anything that cannot be added is reported
     * by name, never silently dropped: a "buy it again" that quietly returns less than was asked
     * for is worse than one that refuses.
     */
    async reorder(customerId: string, orderId: string, changeId: string): Promise<ReorderResultDTO> {
      if (!isUuid(orderId)) throw new OrderNotFoundError();
      const p = await policy();
      const candidates = await repo.orderItemsForReorder(customerId, orderId);
      if (!candidates) throw new OrderNotFoundError();

      const cartId = await repo.getOrCreateCartId(customerId);
      const existing = await repo.lines(cartId);
      let room = p.maxDistinctItems - existing.length;

      const skipped: ReorderSkippedDTO[] = [];
      const skip = (c: { product_id: string; name: string }, reason: ReorderSkippedDTO["reason"]) =>
        skipped.push({ productId: c.product_id, name: c.name === "" ? null : c.name, reason });
      const ids: string[] = [];
      const quantities: number[] = [];

      for (const c of candidates) {
        if (c.status === null || c.status === STATUS_ARCHIVED) {
          skip(c, "removed"); // gone for good
          continue;
        }
        // 054: something the shop has run out of is skipped as unavailable, exactly like one the
        // operator withdrew. What the shopper must NOT get is it silently added to a cart that
        // cannot be paid for.
        if (!purchasable(c.status, c.stock_tracked === true, c.stock_on_hand)) {
          skip(c, "unavailable");
          continue;
        }
        if (!containsProduct(existing, c.product_id)) {
          if (room <= 0) {
            skip(c, "cart_full");
            continue;
          }
          room -= 1;
        }
        let q = c.quantity;
        if (q > p.maxLineQuantity) {
          q = p.maxLineQuantity;
          skip(c, "clamped"); // added, but at the ceiling — still worth telling them
        }
        ids.push(c.product_id);
        quantities.push(q);
      }

      if (ids.length > 0) await repo.mergeItems(cartId, changeId, ids, quantities, p.maxLineQuantity);
      return { cart: await build(cartId, p), skipped };
    },

    /**
     * Apply a promotional code (027 US5; routed for the first time by 070 FR-022).
     *
     * A code that does not currently qualify is REFUSED with its reason, not stored: applying one
     * that silently does nothing would be the "code is invalid" experience with no explanation.
     * (A code that qualified and LATER stops qualifying is different — it stays, and the cart read
     * reports it.) Applying while another is applied REPLACES it.
     */
    async applyPromo(customerId: string, rawCode: string): Promise<CartDTO> {
      const p = await policy();
      const code = await repo.promoByCode(normalisePromoCode(rawCode));
      if (!code) throw new PromoRefusedError("promo_unknown");

      const cartId = await repo.getOrCreateCartId(customerId);
      const usage = await repo.promoUsageFor(code.id, customerId);

      // Evaluated against the CURRENT payable subtotal — the figure the shopper is looking at.
      const result = evaluatePromo(code, usage, payableCents((await repo.allLines(cartId)).lines), now());
      if (!result.ok) throw new PromoRefusedError(result.reason, code);

      await repo.setCartPromo(cartId, code.id);
      return build(cartId, p);
    },

    /** Clear the applied code. Idempotent: removing one that is not applied is not an error. */
    async removePromo(customerId: string): Promise<CartDTO> {
      const cartId = await repo.getOrCreateCartId(customerId);
      await repo.setCartPromo(cartId, null);
      return build(cartId);
    },

    /**
     * What checkout must use to price a discount — the SAME rule the cart read uses, so the cart
     * and the charge cannot disagree. Usage IS counted here: this is the authoritative moment.
     *
     * A code that no longer qualifies simply does not discount. It is NOT an error: refusing the
     * whole checkout because a promotion lapsed would be worse than charging the honest full
     * price, and the cart already told the shopper it stopped applying.
     */
    async discountForCustomer(
      customerId: string,
      payable: number,
    ): Promise<{ cents: number; promo: Pick<PromoCode, "id" | "code"> | null }> {
      const cartId = await repo.getOrCreateCartId(customerId);
      const meta = await repo.meta(cartId);
      if (!meta.promoCodeId) return { cents: 0, promo: null };
      const code = await repo.promoById(meta.promoCodeId);
      if (!code) return { cents: 0, promo: null };
      const result = evaluatePromo(code, await repo.promoUsageFor(code.id, customerId), payable, now());
      return result.ok ? { cents: result.discountCents, promo: { id: code.id, code: code.code } } : { cents: 0, promo: null };
    },
  };
}

export type CartService = ReturnType<typeof createCartService>;
