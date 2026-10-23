// A signed-in shopper's server cart is the only cart a charge is computed from; a guest cart lives on
// the device and is re-priced through `preview`. Prices are re-read on every read, a line that cannot
// be bought is shown but excluded from every total, and promotions are re-evaluated, never stored.
import {
  CURRENCY, emitMetric, formatCents, imageWidthsField, metricNamespace, outOfStock, parseCents, pooled, publicImageAddress, purchasable,
} from "@effy/edge-shared";
import { hasMinimum, meetsMinimum, remainingToMinimum, type CartPolicy } from "@effy/edge-shared/cart-policy";
import {
  unitPrice,
  type CartCheckoutStateDTO, type CartDTO, type CartLineDTO, type CartNoticeDTO, type ReorderResultDTO, type ReorderSkippedDTO,
} from "@effy/shared-types";

import { isUuid } from "../lib/ids";
import { cartPromotionView, promotionPort, type PromotionPort } from "../promotions/pricing";
import { packageKey } from "./package-key";
import type { CartLineRow, CartRepository } from "./repository";

const STATUS_ARCHIVED = "archived";

export class ProductNotFoundError extends Error {}
export class ProductUnavailableError extends Error {}
export class CartFullError extends Error {}
export class OrderNotFoundError extends Error {}

/** Carries how many the shop can supply; `ProductUnavailableError` means none. */
export class InsufficientStockError extends Error {
  /** The variant id; the field name is kept for the problem body. */
  constructor(readonly productId: string, readonly available: number) {
    super(`cart: only ${available} available`);
  }
}

export interface LineInput {
  variantId: string;
  quantity: number;
}

export type ImageAddress = (storageKey: string | null | undefined) => Promise<string | null>;
export type PolicyReader = () => Promise<CartPolicy>;

const clampTo = (qty: number, max: number): number => (qty < 1 ? 1 : qty > max ? max : qty);
const quantityOf = (rows: readonly CartLineRow[], variantId: string) => rows.find((r) => r.variant_id === variantId)?.quantity ?? 0;
const containsVariant = (rows: readonly CartLineRow[], variantId: string) => rows.some((r) => r.variant_id === variantId);
const isPurchasable = (r: Pick<CartLineRow, "status" | "variant_state" | "stock_tracked" | "stock_on_hand">) =>
  purchasable(r.status, r.variant_state, r.stock_tracked, r.stock_on_hand);
const lineWords = (row: Pick<CartLineRow, "name" | "variant_label">) => (row.variant_label ? `${row.name} (${row.variant_label})` : row.name);

/** Why a line cannot be bought, said about the product, never the shop. */
function unavailableDetail(row: CartLineRow): string {
  const name = lineWords(row);
  if (row.status === STATUS_ARCHIVED || row.variant_state === "removed") return `${name} is no longer sold`;
  if (outOfStock(row.status, row.variant_state, row.stock_tracked, row.stock_on_hand)) return `${name} is out of stock`;
  return `${name} is unavailable right now`;
}

/** Sums duplicate variants (clamped to the line ceiling) and drops invalid entries, in first-seen order. */
export function dedupe(lines: readonly LineInput[], max: number): { ids: string[]; qty: Map<string, number> } {
  const qty = new Map<string, number>();
  const ids: string[] = [];
  for (const l of lines) {
    if (!Number.isInteger(l.quantity) || l.quantity <= 0 || !isUuid(l.variantId)) continue;
    if (!qty.has(l.variantId)) ids.push(l.variantId);
    qty.set(l.variantId, (qty.get(l.variantId) ?? 0) + l.quantity);
  }
  for (const [id, q] of qty) qty.set(id, clampTo(q, max));
  return { ids, qty };
}

/** The payable subtotal: unsuppliable lines excluded, partly-supplied lines counted up to stock. */
export function payableCents(rows: readonly CartLineRow[]): number {
  let total = 0;
  for (const row of rows) {
    if (!isPurchasable(row)) continue;
    total += parseCents(row.unit_price_amount) * suppliableQuantity(row);
  }
  return total;
}

function suppliableQuantity(row: CartLineRow): number {
  const capped = row.stock_tracked && row.stock_on_hand !== null && row.stock_on_hand < row.quantity
    ? row.stock_on_hand
    : row.quantity;
  return Math.max(0, capped);
}

/** Judged on the payable total after discount; enforced again at the intent. */
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
  promotions?: PromotionPort;
  policy: PolicyReader;
  imageAddress?: ImageAddress;
  now?: () => Date;
}) {
  const { repo, policy } = deps;
  const promotions: PromotionPort = deps.promotions ?? promotionPort(pooled);
  const imageAddress = deps.imageAddress ?? publicImageAddress;
  const now = deps.now ?? (() => new Date());

  async function toLines(rows: readonly CartLineRow[], collectNotices: boolean) {
    const notices: CartNoticeDTO[] = [];
    let subtotalCents = 0;

    const lines = await Promise.all(
      rows.map(async (row): Promise<CartLineDTO> => {
        const available = isPurchasable(row);
        const unitCents = parseCents(row.unit_price_amount);

        // The shown quantity is capped at stock so line totals add up; the cart row keeps the asked
        // quantity in case stock returns.
        const payableQty = suppliableQuantity(row);
        const lineCents = unitCents * payableQty;

        const changedFrom = row.unit_price_at_add !== null && row.unit_price_at_add !== row.unit_price_amount
          ? row.unit_price_at_add
          : null;

        return {
          id: row.id,
          productId: row.product_id,
          variantId: row.variant_id,
          name: row.name,
          variantLabel: row.variant_label,
          imageUrl: await imageAddress(row.storage_key),
          ...imageWidthsField(row.image_widths),
          unitPriceAmount: row.unit_price_amount,
          quantity: payableQty,
          lineSubtotalAmount: formatCents(lineCents),
          available,
          priceChangedFrom: changedFrom,
          packageKey: packageKey(row.shop_id),
          // Replaced in `assemble` with the unit price after this line's discount.
          unitPrice: unitPrice(row.unit_price_amount, row.pack_quantity, row.pack_unit, row.unit_basis),
        };
      }),
    );

    rows.forEach((row, i) => {
      const line = lines[i]!;
      if (collectNotices && line.priceChangedFrom !== null) {
        notices.push({ productId: row.product_id, variantId: row.variant_id, kind: "price_changed", detail: lineWords(row) });
      }
      if (line.available) {
        subtotalCents += parseCents(line.lineSubtotalAmount);
        if (collectNotices && line.quantity < row.quantity) {
          notices.push({ productId: row.product_id, variantId: row.variant_id, kind: "quantity_clamped", detail: `Only ${line.quantity} of ${lineWords(row)} available` });
        }
      } else if (collectNotices) {
        // One notice kind with the cause in the detail: out of stock (wait) differs from no longer sold.
        notices.push({ productId: row.product_id, variantId: row.variant_id, kind: "unavailable", detail: unavailableDetail(row) });
      }
    });

    return { lines, subtotalCents, notices };
  }

  /**
   * The entered code is re-judged on every read. One that stops applying stays on the cart and the
   * cart says why; it applies again by itself if the cart recovers.
   */
  async function promotionsOf(cartId: string | null, lines: readonly CartLineDTO[]) {
    const meta = cartId !== null ? await repo.meta(cartId) : null;
    const pricing = await promotions.price({
      customerId: meta?.customerId ?? null,
      enteredCodeId: meta?.promotionCodeId ?? null,
      lines: lines.filter((l) => l.available).map((l) => ({ variantId: l.variantId, productId: l.productId, unitCents: parseCents(l.unitPriceAmount), quantity: l.quantity })),
      deliveryType: null,
      deliveryFeeCents: null,
      now: now(),
    });
    return { pricing, view: cartPromotionView(pricing) };
  }

  async function assemble(input: {
    cartId: string | null;
    lineRows: readonly CartLineRow[];
    savedRows?: readonly CartLineRow[];
    revision?: number;
    policy: CartPolicy;
    extra?: readonly CartNoticeDTO[];
    sweep: boolean;
  }): Promise<CartDTO> {
    const notices: CartNoticeDTO[] = [...(input.extra ?? [])];

    // An archived product or removed variant is swept; an unavailable product or inactive variant is
    // kept and flagged, since the shop may turn it back on.
    const archived: string[] = [];
    const kept: CartLineRow[] = [];
    for (const row of input.lineRows) {
      if (row.status === STATUS_ARCHIVED || row.variant_state === "removed") {
        archived.push(row.variant_id);
        notices.push({ productId: row.product_id, variantId: row.variant_id, kind: "removed", detail: lineWords(row) });
      } else {
        kept.push(row);
      }
    }
    const swept = input.sweep && input.cartId !== null && archived.length > 0;
    if (swept) await repo.deleteLines(input.cartId!, archived);

    const payable = await toLines(kept, true);
    notices.push(...payable.notices);

    // Saved lines contribute to nothing and raise no notices.
    const saved = await toLines(input.savedRows ?? [], false);

    // A sweep advances the revision by exactly one.
    const revision = (input.revision ?? 0) + (swept ? 1 : 0);

    const { pricing, view } = await promotionsOf(input.cartId, payable.lines);
    const discountCents = pricing.outcome.goodsDiscountCents;
    // Cart-level: productId is null.
    if (view.enteredLapsed) notices.push({ productId: null, kind: "promo_no_longer_applies", detail: view.enteredLapsed });
    const grandCents = payable.subtotalCents - discountCents;
    const lineDiscountCents = (variantId: string) => pricing.outcome.lineDiscounts[variantId] ?? 0;
    const rowOf = new Map(kept.map((r) => [r.variant_id, r]));

    return {
      revision,
      lines: payable.lines.map((l) => {
        const off = lineDiscountCents(l.variantId);
        const row = rowOf.get(l.variantId)!;
        // The comparison price follows the unit cost after this line's discount.
        const effective = l.quantity > 0 && off > 0 ? formatCents(Math.round((parseCents(l.unitPriceAmount) * l.quantity - off) / l.quantity)) : l.unitPriceAmount;
        return { ...l, discountAmount: formatCents(off), unitPrice: unitPrice(effective, row.pack_quantity, row.pack_unit, row.unit_basis) };
      }),
      savedLines: saved.lines,
      itemSubtotalAmount: formatCents(payable.subtotalCents),
      discountAmount: formatCents(discountCents),
      grandTotalAmount: formatCents(grandCents),
      currency: CURRENCY,
      notices,
      discount: view.discount,
      promotions: view.promotions,
      promotionsNotApplied: view.notApplied,
      checkout: checkoutState(payable.lines.length, payable.lines.filter((l) => l.available).length, grandCents, input.policy),
      limits: { maxLineQuantity: input.policy.maxLineQuantity, maxDistinctItems: input.policy.maxDistinctItems },
    };
  }

  async function build(cartId: string, cartPolicy?: CartPolicy, extra?: readonly CartNoticeDTO[]): Promise<CartDTO> {
    const p = cartPolicy ?? (await policy());
    const all = await repo.allLines(cartId);
    return assemble({ cartId, lineRows: all.lines, savedRows: all.saved, revision: all.revision, policy: p, extra, sweep: true });
  }

  async function assertPurchasable(variantId: string): Promise<void> {
    if (!isUuid(variantId)) throw new ProductNotFoundError();
    const v = await repo.variantStatus(variantId);
    if (!v) throw new ProductNotFoundError();
    if (!isPurchasable(v)) throw new ProductUnavailableError();
  }

  /**
   * Advisory: checks the line's resulting quantity so the shopper hears before payment. The binding
   * check is the locked stock deduction at payment.
   */
  async function assertCanTake(variantId: string, want: number): Promise<void> {
    if (!isUuid(variantId)) throw new ProductNotFoundError();
    const v = await repo.variantStatus(variantId);
    if (!v) throw new ProductNotFoundError();
    if (!isPurchasable(v)) throw new ProductUnavailableError();
    if (v.stock_tracked && v.stock_on_hand !== null && want > v.stock_on_hand) {
      emitMetric(metricNamespace(), "StockBlocked", 1, { stage: "add" });
      throw new InsufficientStockError(variantId, v.stock_on_hand);
    }
  }

  const clampNotice = (variantId: string, max: number): CartNoticeDTO => ({
    productId: null, variantId, kind: "quantity_clamped", detail: `Limited to ${max} per item`,
  });

  return {
    async get(customerId: string): Promise<CartDTO> {
      return build(await repo.getOrCreateCartId(customerId));
    },

    policy,

    /** Re-prices a guest cart without writing; applies the distinct-item ceiling itself. */
    async preview(lines: readonly LineInput[]): Promise<CartDTO> {
      const p = await policy();
      const { ids, qty } = dedupe(lines, p.maxLineQuantity);
      const wanted = ids.slice(0, p.maxDistinctItems);

      const byId = new Map((await repo.variantSnapshots(wanted)).map((r) => [r.variant_id, r]));
      const ordered: CartLineRow[] = [];
      const notices: CartNoticeDTO[] = [];
      for (const id of wanted) {
        const row = byId.get(id.toLowerCase()) ?? byId.get(id);
        if (!row) notices.push({ productId: null, variantId: id, kind: "removed", detail: null });
        else ordered.push({ ...row, quantity: qty.get(id)! });
      }
      return assemble({ cartId: null, lineRows: ordered, policy: p, extra: notices, sweep: false });
    },

    async add(customerId: string, variantId: string, changeId: string, qty: number): Promise<CartDTO> {
      const p = await policy();
      const cartId = await repo.getOrCreateCartId(customerId);

      // The ceiling counts distinct products, so a line already in the cart can always grow.
      const existing = await repo.lines(cartId);
      if (!containsVariant(existing, variantId) && existing.length >= p.maxDistinctItems) throw new CartFullError();

      // Checked on the resulting quantity, so repeated adds cannot walk a line past stock.
      const held = quantityOf(existing, variantId);
      await assertCanTake(variantId, held + qty);

      const clamped = clampTo(qty, p.maxLineQuantity);
      const applied = await repo.addItem(cartId, variantId, changeId, clamped, p.maxLineQuantity);

      const wasClamped = qty !== clamped || (containsVariant(existing, variantId) && held + clamped > p.maxLineQuantity);
      return build(cartId, p, applied && wasClamped ? [clampNotice(variantId, p.maxLineQuantity)] : []);
    },

    async setQty(customerId: string, variantId: string, changeId: string, qty: number): Promise<CartDTO> {
      if (!isUuid(variantId)) throw new ProductNotFoundError();
      const p = await policy();
      const cartId = await repo.getOrCreateCartId(customerId);

      if (qty <= 0) {
        await repo.removeItem(cartId, variantId, changeId);
        return build(cartId, p);
      }

      await assertCanTake(variantId, qty);

      const clamped = clampTo(qty, p.maxLineQuantity);
      const applied = await repo.setQty(cartId, variantId, changeId, clamped);
      return build(cartId, p, applied && clamped !== qty ? [clampNotice(variantId, p.maxLineQuantity)] : []);
    },

    async remove(customerId: string, variantId: string, changeId: string): Promise<CartDTO> {
      if (!isUuid(variantId)) throw new ProductNotFoundError();
      const cartId = await repo.getOrCreateCartId(customerId);
      await repo.removeItem(cartId, variantId, changeId);
      return build(cartId);
    },

    async clear(customerId: string, changeId: string): Promise<CartDTO> {
      const cartId = await repo.getOrCreateCartId(customerId);
      await repo.deleteAllItems(cartId, changeId);
      return build(cartId);
    },

    async merge(customerId: string, changeId: string, lines: readonly LineInput[]): Promise<CartDTO> {
      const p = await policy();
      const cartId = await repo.getOrCreateCartId(customerId);
      const { ids, qty } = dedupe(lines, p.maxLineQuantity);

      // Archived products and removed variants are dropped; unavailable ones merge and arrive flagged.
      const kept: string[] = [];
      for (const id of ids) {
        const v = await repo.variantStatus(id);
        if (v && v.status !== STATUS_ARCHIVED && v.variant_state !== "removed") kept.push(id);
      }

      // Lines already in the cart take no room under the ceiling; new ones stop once it is full.
      const existing = await repo.lines(cartId);
      let room = p.maxDistinctItems - existing.length;
      const mergeIds = kept.filter((id) => containsVariant(existing, id) || room-- > 0);

      await repo.mergeItems(cartId, changeId, mergeIds, mergeIds.map((id) => qty.get(id)!), p.maxLineQuantity);
      return build(cartId, p);
    },

    async setAside(customerId: string, variantId: string, changeId: string): Promise<CartDTO> {
      if (!isUuid(variantId)) throw new ProductNotFoundError();
      const cartId = await repo.getOrCreateCartId(customerId);
      await repo.setAside(cartId, variantId, changeId);
      return build(cartId);
    },

    /** Gated like add, so the saved list is not a way round purchasability. */
    async restoreSaved(customerId: string, variantId: string, changeId: string): Promise<CartDTO> {
      await assertPurchasable(variantId);
      const p = await policy();
      const cartId = await repo.getOrCreateCartId(customerId);
      const existing = await repo.lines(cartId);
      if (!containsVariant(existing, variantId) && existing.length >= p.maxDistinctItems) throw new CartFullError();
      await repo.restoreSaved(cartId, variantId, changeId, p.maxLineQuantity);
      return build(cartId, p);
    },

    async deleteSaved(customerId: string, variantId: string, changeId: string): Promise<CartDTO> {
      if (!isUuid(variantId)) throw new ProductNotFoundError();
      const cartId = await repo.getOrCreateCartId(customerId);
      await repo.deleteSaved(cartId, variantId, changeId);
      return build(cartId);
    },

    /** Re-adds a past order at current prices; anything not added is reported, never dropped. */
    async reorder(customerId: string, orderId: string, changeId: string): Promise<ReorderResultDTO> {
      if (!isUuid(orderId)) throw new OrderNotFoundError();
      const p = await policy();
      const candidates = await repo.orderItemsForReorder(customerId, orderId);
      if (!candidates) throw new OrderNotFoundError();

      const cartId = await repo.getOrCreateCartId(customerId);
      const existing = await repo.lines(cartId);
      let room = p.maxDistinctItems - existing.length;

      const skipped: ReorderSkippedDTO[] = [];
      const skip = (c: { product_id: string; variant_id: string; variant_label: string | null; name: string }, reason: ReorderSkippedDTO["reason"]) =>
        skipped.push({ productId: c.product_id, variantId: c.variant_id, name: c.name === "" ? null : c.name, variantLabel: c.variant_label, reason });
      const ids: string[] = [];
      const quantities: number[] = [];

      for (const c of candidates) {
        if (c.status === null || c.status === STATUS_ARCHIVED || c.variant_state === null || c.variant_state === "removed") {
          skip(c, "removed");
          continue;
        }
        // Out of stock is skipped like withdrawn, never added to a cart that cannot be paid.
        if (!purchasable(c.status, c.variant_state, c.stock_tracked === true, c.stock_on_hand)) {
          skip(c, "unavailable");
          continue;
        }
        if (!containsVariant(existing, c.variant_id)) {
          if (room <= 0) {
            skip(c, "cart_full");
            continue;
          }
          room -= 1;
        }
        let q = c.quantity;
        if (q > p.maxLineQuantity) {
          q = p.maxLineQuantity;
          skip(c, "clamped");
        }
        ids.push(c.variant_id);
        quantities.push(q);
      }

      if (ids.length > 0) await repo.mergeItems(cartId, changeId, ids, quantities, p.maxLineQuantity);
      return { cart: await build(cartId, p), skipped };
    },

    /**
     * A code the shopper cannot use is refused with its reason; one that is valid but does not apply now
     * is stored and the cart says why. A new code replaces the old one.
     */
    async applyPromo(customerId: string, rawCode: string): Promise<CartDTO> {
      const p = await policy();
      const cartId = await repo.getOrCreateCartId(customerId);
      const rows = (await repo.allLines(cartId)).lines.filter(isPurchasable);
      const codeId = await promotions.vet({
        customerId,
        raw: rawCode,
        lines: rows.map((r) => ({ variantId: r.variant_id, productId: r.product_id, unitCents: parseCents(r.unit_price_amount), quantity: suppliableQuantity(r) })),
        now: now(),
      });
      await repo.setCartPromo(cartId, codeId);
      return build(cartId, p);
    },

    async removePromo(customerId: string): Promise<CartDTO> {
      const cartId = await repo.getOrCreateCartId(customerId);
      await repo.setCartPromo(cartId, null);
      return build(cartId);
    },

    async enteredCodeFor(customerId: string): Promise<string | null> {
      const cartId = await repo.getOrCreateCartId(customerId);
      return (await repo.meta(cartId)).promotionCodeId;
    },
  };
}

export type CartService = ReturnType<typeof createCartService>;
