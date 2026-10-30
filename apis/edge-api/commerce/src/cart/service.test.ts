import { defaultCartPolicy, type CartPolicy } from "@effy/edge-shared/cart-policy";
import { describe, expect, it } from "vitest";

import { candidateOf, type FixtureCandidate, melbourneContext, pricePromotions, type PromotionRecord, type PromotionWords } from "@effy/edge-shared/promotions";

import { type Pricing, type PricingInput, PromotionCodeRefusedError, type PromotionPort } from "../promotions/pricing";
import type { CartLineRow, CartRepository, ReorderCandidate, VariantStatusRow } from "./repository";
import {
  CartFullError, checkoutState, createCartService, dedupe, InsufficientStockError, OrderNotFoundError, payableCents,
  ProductNotFoundError, ProductUnavailableError,
} from "./service";

const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const A = id(1);
const B = id(2);
const C = id(3);
const CUSTOMER = "cust-1";
const NOW = new Date("2026-07-30T12:00:00Z");

interface Product {
  name: string; price: string; status?: string; tracked?: boolean; onHand?: number | null; shop?: string;
}

/** An in-memory cart repository with the same observable rules as the real one. */
function world(products: Record<string, Product>, policy: Partial<CartPolicy> = {}) {
  const cart = new Map<string, { qty: number; atAdd: string | null }>();
  const saved = new Map<string, { qty: number; atAdd: string | null }>();
  const applied = new Set<string>();
  /** By code (null = automatic); the real engine prices them. */
  const promos = new Map<string, { code: string | null; candidate: FixtureCandidate; words: PromotionWords }>();
  const priced: PricingInput[] = [];
  const orders = new Map<string, { owner: string; items: ReorderCandidate[] }>();
  let revision = 0;
  let promoId: string | null = null;
  const calls: string[] = [];

  const row = (pid: string, e: { qty: number; atAdd: string | null }): CartLineRow => {
    const p = products[pid]!;
    return {
      // Each fake product is its own single variant, keyed by the same id.
      id: `line-${pid}`, product_id: pid, variant_id: pid, variant_label: null, age_restricted: false, variant_state: "active",
      pack_quantity: null, pack_unit: null, unit_basis: null,
      shop_id: p.shop ?? "shop-1", quantity: e.qty, name: p.name,
      unit_price_amount: p.price, currency: "AUD", status: p.status ?? "active", stock_tracked: p.tracked ?? false,
      stock_on_hand: p.tracked ? (p.onHand ?? 0) : null, storage_key: null, image_widths: null, unit_price_at_add: e.atAdd,
    };
  };
  const guard = (changeId: string, fn: () => void): boolean => {
    if (changeId !== "") {
      if (applied.has(changeId)) return false;
      applied.add(changeId);
    }
    fn();
    revision += 1;
    return true;
  };

  const repo: CartRepository = {
    getOrCreateCartId: async () => "cart-1",
    meta: async () => ({ revision, promotionCodeId: promoId, customerId: CUSTOMER }),
    lines: async () => [...cart].map(([pid, e]) => row(pid, e)),
    allLines: async () => ({
      lines: [...cart].map(([pid, e]) => row(pid, e)),
      saved: [...saved].map(([pid, e]) => row(pid, e)),
      revision,
    }),
    variantStatus: async (pid): Promise<VariantStatusRow | null> => {
      const p = products[pid];
      return p ? { product_id: pid, status: p.status ?? "active", variant_state: "active", price_amount: p.price, stock_tracked: p.tracked ?? false, stock_on_hand: p.tracked ? (p.onHand ?? 0) : null } : null;
    },
    variantSnapshots: async (ids) => ids.filter((i) => products[i]).map((i) => ({ ...row(i, { qty: 0, atAdd: null }), id: "" })),
    orderItemsForReorder: async (customerId, orderId) => {
      const o = orders.get(orderId);
      return o && o.owner === customerId ? o.items : null;
    },
    addItem: async (_c, pid, changeId, qty, max) =>
      guard(changeId, () => {
        const e = cart.get(pid);
        cart.set(pid, e ? { ...e, qty: Math.min(e.qty + qty, max) } : { qty, atAdd: products[pid]!.price });
      }),
    setQty: async (_c, pid, changeId, qty) => guard(changeId, () => { const e = cart.get(pid); if (e) e.qty = qty; }),
    removeItem: async (_c, pid, changeId) => guard(changeId, () => void cart.delete(pid)),
    deleteAllItems: async (_c, changeId) => guard(changeId, () => { cart.clear(); promoId = null; }),
    deleteLines: async (_c, ids) => { calls.push(`sweep:${ids.join(",")}`); guard("", () => ids.forEach((i) => cart.delete(i))); },
    mergeItems: async (_c, changeId, ids, quantities, max) =>
      guard(changeId, () => ids.forEach((pid, i) => {
        if (!products[pid]) return;
        const e = cart.get(pid);
        const q = Math.min(quantities[i]!, max);
        cart.set(pid, e ? { ...e, qty: Math.min(Math.max(e.qty, q), max) } : { qty: q, atAdd: products[pid]!.price });
      })),
    setAside: async (_c, pid, changeId) => guard(changeId, () => { const e = cart.get(pid); if (e) { saved.set(pid, e); cart.delete(pid); } }),
    restoreSaved: async (_c, pid, changeId, max) =>
      guard(changeId, () => { const e = saved.get(pid); if (e) { cart.set(pid, { qty: Math.min(e.qty, max), atAdd: products[pid]!.price }); saved.delete(pid); } }),
    deleteSaved: async (_c, pid, changeId) => guard(changeId, () => void saved.delete(pid)),
    setCartPromo: async (_c, pid) => guard("", () => { promoId = pid; }),
  };

  const p: CartPolicy = { ...defaultCartPolicy(), ...policy };
  /** A stand-in for the database half of promotions; the pricing itself is the shared engine. */
  const promotions: PromotionPort = {
    async price(input): Promise<Pricing> {
      priced.push(input);
      const live = [...promos.values()].filter((x) => x.code === null || `code-${x.code}` === input.enteredCodeId);
      const candidates = live.map((x, i) => candidateOf({ ...x.candidate, codeId: x.code ? `code-${x.code}` : null, codeText: x.code }, i));
      const outcome = pricePromotions(
        { lines: input.lines.map((l) => ({ lineId: l.variantId, productId: l.productId, categoryIds: [], brand: null, unitCents: l.unitCents, quantity: l.quantity })), deliveryType: null, deliveryFeeCents: null },
        candidates,
        melbourneContext(input.now),
      );
      const records = new Map(live.map((x) => [x.candidate.id, { id: x.candidate.id, name: x.candidate.id, headline: null, words: x.words } as unknown as PromotionRecord]));
      const entered = live.find((x) => x.code !== null);
      return { outcome, records, enteredRefusal: null, enteredPromotionId: entered?.candidate.id ?? null, singleUseCodeIds: new Set() };
    },
    async vet(input) {
      const found = [...promos.values()].find((x) => x.code !== null && x.code === input.raw.replace(/\s+/g, "").toUpperCase());
      if (!found) throw new PromotionCodeRefusedError("promo_unknown", "That code isn't recognised. Check it and try again.");
      return `code-${found.code}`;
    },
  };
  const svc = createCartService({ repo, policy: async () => p, imageAddress: async () => null, now: () => NOW, promotions });
  return { svc, cart, saved, promos, priced, orders, calls, products, setRevision: (n: number) => (revision = n), seedAtAdd: (pid: string, atAdd: string | null, qty = 1) => cart.set(pid, { qty, atAdd }) };
}

const WORDS: PromotionWords = {
  kind: "cart", valueType: "percent", percentOff: 20, amountOffCents: null, maxDiscountCents: null, bxgy: null, covers: null,
  deliveryTypes: ["effy", "courier"], audience: "everyone", minSubtotalCents: 0, minQuantity: null, daysOfWeek: null,
  minuteFrom: null, minuteTo: null, maxUsesPerCustomer: null,
};
/** SPRING20 - 20% off the cart, optionally with a minimum (cents). */
const spring20 = (minSubtotalCents = 0) => ({
  code: "SPRING20" as string | null,
  candidate: { id: "promo-1", kind: "cart" as const, valueType: "percent" as const, percentOff: 20, minSubtotalCents },
  words: { ...WORDS, minSubtotalCents },
});

const milk: Product = { name: "Oat Milk", price: "4.50" };
const bread: Product = { name: "Sourdough", price: "9.00" };

describe("reading the cart", () => {
  it("an empty cart is fully shaped: empty lists, zero totals, checkout blocked as empty", async () => {
    const cart = await world({}).svc.get(CUSTOMER);
    expect(cart).toEqual({
      revision: 0, lines: [], savedLines: [], itemSubtotalAmount: "0.00", discountAmount: "0.00",
      grandTotalAmount: "0.00", currency: "AUD", notices: [], discount: null, promotions: [], promotionsNotApplied: [],
      checkout: { allowed: false, blockedReason: "empty", minimumSubtotalAmount: null, remainingAmount: null },
      limits: { maxLineQuantity: 99, maxDistinctItems: 100 },
    });
  });

  it("prices every line from the CURRENT product price, to the cent", async () => {
    const w = world({ [A]: milk, [B]: bread });
    await w.svc.add(CUSTOMER, A, "c1", 3);
    const cart = await w.svc.add(CUSTOMER, B, "c2", 1);
    expect(cart.lines.map((l) => [l.name, l.quantity, l.lineSubtotalAmount])).toEqual([["Oat Milk", 3, "13.50"], ["Sourdough", 1, "9.00"]]);
    expect(cart.itemSubtotalAmount).toBe("22.50");
    expect(cart.grandTotalAmount).toBe("22.50");
    expect(cart.checkout.allowed).toBe(true);
  });

  it("reports a price change against the price the line was added at, and charges today's", async () => {
    const w = world({ [A]: { ...milk, price: "5.00" } });
    w.seedAtAdd(A, "4.50", 2);
    const cart = await w.svc.get(CUSTOMER);
    expect(cart.lines[0]).toMatchObject({ unitPriceAmount: "5.00", priceChangedFrom: "4.50", lineSubtotalAmount: "10.00" });
    expect(cart.notices).toEqual([{ productId: A, variantId: A, kind: "price_changed", detail: "Oat Milk" }]);
  });

  it("never fabricates a price change from a line that predates price tracking", async () => {
    const w = world({ [A]: milk });
    w.seedAtAdd(A, null);
    const cart = await w.svc.get(CUSTOMER);
    expect(cart.lines[0]?.priceChangedFrom).toBeNull();
    expect(cart.notices).toEqual([]);
  });

  it("an unavailable line is shown, flagged, and excluded from every total", async () => {
    const w = world({ [A]: milk, [B]: { ...bread, status: "unavailable" } });
    w.seedAtAdd(A, "4.50", 1);
    w.seedAtAdd(B, "9.00", 2);
    const cart = await w.svc.get(CUSTOMER);
    expect(cart.lines.map((l) => l.available)).toEqual([true, false]);
    expect(cart.itemSubtotalAmount).toBe("4.50");
    expect(cart.notices).toContainEqual({ productId: B, variantId: B, kind: "unavailable", detail: "Sourdough is unavailable right now" });
  });

  it("says OUT OF STOCK when the shelf is empty - a different sentence from 'unavailable'", async () => {
    const w = world({ [A]: { ...milk, tracked: true, onHand: 0 } });
    w.seedAtAdd(A, "4.50", 1);
    const cart = await w.svc.get(CUSTOMER);
    expect(cart.notices[0]?.detail).toBe("Oat Milk is out of stock");
    expect(cart.checkout).toMatchObject({ allowed: false, blockedReason: "no_payable_items" });
  });

  it("caps the presented quantity at stock so the line still adds up, and tells the shopper", async () => {
    const w = world({ [A]: { ...milk, tracked: true, onHand: 2 } });
    w.seedAtAdd(A, "4.50", 5);
    const cart = await w.svc.get(CUSTOMER);
    expect(cart.lines[0]).toMatchObject({ quantity: 2, lineSubtotalAmount: "9.00", available: true });
    expect(cart.notices).toEqual([{ productId: A, variantId: A, kind: "quantity_clamped", detail: "Only 2 of Oat Milk available" }]);
    expect(w.cart.get(A)?.qty).toBe(5); // the stored row is untouched: if stock returns, so does the 5
  });

  it("sweeps an archived line, reports it, and advances the revision by one", async () => {
    const w = world({ [A]: milk, [B]: { ...bread, status: "archived" } });
    w.seedAtAdd(A, "4.50");
    w.seedAtAdd(B, "9.00");
    w.setRevision(7);
    const cart = await w.svc.get(CUSTOMER);
    expect(cart.lines.map((l) => l.productId)).toEqual([A]);
    expect(cart.notices).toContainEqual({ productId: B, variantId: B, kind: "removed", detail: "Sourdough" });
    expect(w.calls).toEqual([`sweep:${B}`]);
    expect(cart.revision).toBe(8);
  });

  it("groups lines by an opaque package key that is not the shop id", async () => {
    const w = world({ [A]: { ...milk, shop: "shop-a" }, [B]: { ...bread, shop: "shop-b" }, [C]: { name: "Soy", price: "3.00", shop: "shop-a" } });
    for (const p of [A, B, C]) w.seedAtAdd(p, null);
    const keys = (await w.svc.get(CUSTOMER)).lines.map((l) => l.packageKey);
    expect(keys[0]).toBe(keys[2]);
    expect(keys[0]).not.toBe(keys[1]);
    for (const k of keys) { expect(k).toMatch(/^pkg_[0-9a-f]{12}$/); expect(k).not.toContain("shop"); }
  });
});

describe("add", () => {
  it("the same change id delivered twice adds once", async () => {
    const w = world({ [A]: milk });
    await w.svc.add(CUSTOMER, A, "tap-1", 2);
    const cart = await w.svc.add(CUSTOMER, A, "tap-1", 2);
    expect(cart.lines[0]?.quantity).toBe(2);
  });

  it("a different change id increments", async () => {
    const w = world({ [A]: milk });
    await w.svc.add(CUSTOMER, A, "tap-1", 2);
    expect((await w.svc.add(CUSTOMER, A, "tap-2", 2)).lines[0]?.quantity).toBe(4);
  });

  it("an unknown or malformed product is not found; a withdrawn one is unavailable", async () => {
    const w = world({ [B]: { ...bread, status: "unavailable" } });
    await expect(w.svc.add(CUSTOMER, A, "c", 1)).rejects.toBeInstanceOf(ProductNotFoundError);
    await expect(w.svc.add(CUSTOMER, "not-a-uuid", "c", 1)).rejects.toBeInstanceOf(ProductNotFoundError);
    await expect(w.svc.add(CUSTOMER, B, "c", 1)).rejects.toBeInstanceOf(ProductUnavailableError);
  });

  it("checks stock against the RESULTING quantity, not the increment, and says how many there are", async () => {
    const w = world({ [A]: { ...milk, tracked: true, onHand: 5 } });
    await w.svc.add(CUSTOMER, A, "c1", 4);
    const err = await w.svc.add(CUSTOMER, A, "c2", 2).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(InsufficientStockError);
    expect((err as InsufficientStockError).available).toBe(5);
    expect(w.cart.get(A)?.qty).toBe(4);
  });

  it("clamps to the per-line ceiling and says so", async () => {
    const w = world({ [A]: milk }, { maxLineQuantity: 5 });
    const cart = await w.svc.add(CUSTOMER, A, "c1", 9);
    expect(cart.lines[0]?.quantity).toBe(5);
    expect(cart.notices).toContainEqual({ productId: null, variantId: A, kind: "quantity_clamped", detail: "Limited to 5 per item" });
  });

  it("a full cart refuses a NEW product but still lets an existing line grow", async () => {
    const w = world({ [A]: milk, [B]: bread }, { maxDistinctItems: 1 });
    await w.svc.add(CUSTOMER, A, "c1", 1);
    await expect(w.svc.add(CUSTOMER, B, "c2", 1)).rejects.toBeInstanceOf(CartFullError);
    expect((await w.svc.add(CUSTOMER, A, "c3", 1)).lines[0]?.quantity).toBe(2);
  });
});

describe("set quantity, remove, clear", () => {
  it("sets an absolute quantity - repeating it changes nothing", async () => {
    const w = world({ [A]: milk });
    await w.svc.add(CUSTOMER, A, "c1", 1);
    await w.svc.setQty(CUSTOMER, A, "", 3);
    expect((await w.svc.setQty(CUSTOMER, A, "", 3)).lines[0]?.quantity).toBe(3);
  });

  it("zero or less removes the line", async () => {
    const w = world({ [A]: milk });
    await w.svc.add(CUSTOMER, A, "c1", 2);
    expect((await w.svc.setQty(CUSTOMER, A, "", 0)).lines).toEqual([]);
  });

  it("refuses to set more than the shop has", async () => {
    const w = world({ [A]: { ...milk, tracked: true, onHand: 2 } });
    await w.svc.add(CUSTOMER, A, "c1", 1);
    await expect(w.svc.setQty(CUSTOMER, A, "", 3)).rejects.toBeInstanceOf(InsufficientStockError);
  });

  it("removing something not in the cart is a no-op, not an error", async () => {
    await expect(world({ [A]: milk }).svc.remove(CUSTOMER, A, "")).resolves.toMatchObject({ lines: [] });
  });

  it("clear empties the payable cart and keeps what was set aside", async () => {
    const w = world({ [A]: milk, [B]: bread });
    await w.svc.add(CUSTOMER, A, "c1", 1);
    await w.svc.add(CUSTOMER, B, "c2", 1);
    await w.svc.setAside(CUSTOMER, B, "");
    const cart = await w.svc.clear(CUSTOMER, "");
    expect(cart.lines).toEqual([]);
    expect(cart.savedLines.map((l) => l.productId)).toEqual([B]);
  });
});

describe("merge at sign-in", () => {
  it("takes the MAXIMUM of the two quantities, never the sum", async () => {
    const w = world({ [A]: milk, [B]: bread });
    await w.svc.add(CUSTOMER, A, "c1", 3);
    const cart = await w.svc.merge(CUSTOMER, "m1", [{ variantId: A, quantity: 2 }, { variantId: B, quantity: 4 }]);
    expect(cart.lines.map((l) => [l.productId, l.quantity])).toEqual([[A, 3], [B, 4]]);
  });

  it("repeating the merge changes nothing", async () => {
    const w = world({ [A]: milk });
    await w.svc.merge(CUSTOMER, "", [{ variantId: A, quantity: 2 }]);
    expect((await w.svc.merge(CUSTOMER, "", [{ variantId: A, quantity: 2 }])).lines[0]?.quantity).toBe(2);
  });

  it("an empty device cart never empties the account cart", async () => {
    const w = world({ [A]: milk });
    await w.svc.add(CUSTOMER, A, "c1", 2);
    expect((await w.svc.merge(CUSTOMER, "m", [])).lines[0]?.quantity).toBe(2);
  });

  it("drops a product that is gone or archived, but brings an unavailable one across flagged", async () => {
    const w = world({ [A]: { ...milk, status: "unavailable" }, [B]: { ...bread, status: "archived" } });
    const cart = await w.svc.merge(CUSTOMER, "m", [{ variantId: A, quantity: 1 }, { variantId: B, quantity: 1 }, { variantId: C, quantity: 1 }]);
    expect(cart.lines.map((l) => [l.productId, l.available])).toEqual([[A, false]]);
  });

  it("respects the distinct-item ceiling across the merged result", async () => {
    const w = world({ [A]: milk, [B]: bread, [C]: { name: "Soy", price: "3.00" } }, { maxDistinctItems: 2 });
    await w.svc.add(CUSTOMER, A, "c1", 1);
    const cart = await w.svc.merge(CUSTOMER, "m", [{ variantId: A, quantity: 5 }, { variantId: B, quantity: 1 }, { variantId: C, quantity: 1 }]);
    expect(cart.lines.map((l) => l.productId)).toEqual([A, B]); // A did not consume room; C did not fit
    expect(cart.lines[0]?.quantity).toBe(5);
  });
});

describe("saved for later", () => {
  it("a set-aside line leaves the totals and comes back at today's price", async () => {
    const w = world({ [A]: milk, [B]: bread });
    await w.svc.add(CUSTOMER, A, "c1", 1);
    await w.svc.add(CUSTOMER, B, "c2", 1);
    const aside = await w.svc.setAside(CUSTOMER, B, "");
    expect(aside.itemSubtotalAmount).toBe("4.50");
    w.products[B] = { ...bread, price: "10.00" };
    const back = await w.svc.restoreSaved(CUSTOMER, B, "");
    expect(back.lines.find((l) => l.productId === B)).toMatchObject({ unitPriceAmount: "10.00", priceChangedFrom: null });
    expect(back.savedLines).toEqual([]);
  });

  it("cannot be used to route an unavailable product into a payable cart", async () => {
    const w = world({ [A]: { ...milk, status: "unavailable" } });
    w.saved.set(A, { qty: 1, atAdd: "4.50" });
    await expect(w.svc.restoreSaved(CUSTOMER, A, "")).rejects.toBeInstanceOf(ProductUnavailableError);
  });
});

describe("reorder", () => {
  const order = (items: Partial<ReorderCandidate>[]) =>
    items.map((i, n): ReorderCandidate => {
      const pid = i.product_id ?? id(n + 1);
      return { product_id: pid, variant_id: pid, variant_label: null, quantity: 1, name: `Item ${n + 1}`, status: "active", variant_state: "active", stock_tracked: false, stock_on_hand: null, ...i };
    });

  it("someone else's order and a missing order are the SAME not-found", async () => {
    const w = world({ [A]: milk });
    w.orders.set(id(900), { owner: "someone-else", items: order([{}]) });
    await expect(w.svc.reorder(CUSTOMER, id(900), "")).rejects.toBeInstanceOf(OrderNotFoundError);
    await expect(w.svc.reorder(CUSTOMER, id(901), "")).rejects.toBeInstanceOf(OrderNotFoundError);
    await expect(w.svc.reorder(CUSTOMER, "nope", "")).rejects.toBeInstanceOf(OrderNotFoundError);
  });

  it("adds what it can and NAMES everything it could not, with the reason", async () => {
    const w = world({ [A]: milk, [B]: { ...bread, status: "unavailable" }, [id(4)]: { name: "Rice", price: "2.00" } }, { maxLineQuantity: 5 });
    w.orders.set(id(900), {
      owner: CUSTOMER,
      items: order([
        { quantity: 2 },
        { status: "unavailable" },
        { status: null, name: "Deleted thing" },
        { quantity: 9 },
      ]),
    });
    const res = await w.svc.reorder(CUSTOMER, id(900), "r1");
    expect(res.cart.lines.map((l) => [l.productId, l.quantity])).toEqual([[A, 2], [id(4), 5]]);
    expect(res.skipped).toEqual([
      { productId: B, variantId: B, name: "Item 2", variantLabel: null, reason: "unavailable" },
      { productId: C, variantId: C, name: "Deleted thing", variantLabel: null, reason: "removed" },
      { productId: id(4), variantId: id(4), name: "Item 4", variantLabel: null, reason: "clamped" },
    ]);
  });

  it("a double tap does not double the cart", async () => {
    const w = world({ [A]: milk });
    w.orders.set(id(900), { owner: CUSTOMER, items: order([{ quantity: 2 }]) });
    await w.svc.reorder(CUSTOMER, id(900), "r1");
    expect((await w.svc.reorder(CUSTOMER, id(900), "r2")).cart.lines[0]?.quantity).toBe(2); // max(2, 2)
  });
});

describe("promotions (094 - priced by the shared engine)", () => {
  it("applies a valid code and the discount reaches the lines and the total", async () => {
    const w = world({ [A]: { ...milk, price: "50.00" } });
    w.promos.set("promo-1", spring20());
    await w.svc.add(CUSTOMER, A, "c1", 1);
    const cart = await w.svc.applyPromo(CUSTOMER, " spring20 ");
    expect(cart.discount).toEqual({ code: "SPRING20", kind: "percentage", amount: "10.00", label: "20% off" });
    expect(cart.promotions).toEqual([{ promotionId: "promo-1", headline: "20% off", code: "SPRING20", goodsAmount: "10.00", deliveryAmount: "0.00" }]);
    expect(cart.lines[0]?.discountAmount).toBe("10.00");
    expect(cart).toMatchObject({ itemSubtotalAmount: "50.00", discountAmount: "10.00", grandTotalAmount: "40.00" });
  });

  it("refuses a code it cannot use with its reason, and stores nothing", async () => {
    const w = world({ [A]: { ...milk, price: "50.00" } });
    await w.svc.add(CUSTOMER, A, "c1", 1);
    const err = await w.svc.applyPromo(CUSTOMER, "NOPE").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(PromotionCodeRefusedError);
    expect((err as PromotionCodeRefusedError).reason).toBe("promo_unknown");
    expect((await w.svc.get(CUSTOMER)).discount).toBeNull();
  });

  it("an applied code that stops qualifying stays on the cart, discounts nothing, and says why", async () => {
    const w = world({ [A]: { ...milk, price: "50.00" } });
    w.promos.set("promo-1", spring20(4000));
    await w.svc.add(CUSTOMER, A, "c1", 1);
    await w.svc.applyPromo(CUSTOMER, "SPRING20");
    w.products[A] = { ...milk, price: "30.00" };
    const cart = await w.svc.get(CUSTOMER);
    expect(cart.discount).toBeNull();
    expect(cart.discountAmount).toBe("0.00");
    expect(cart.notices).toContainEqual({ productId: null, kind: "promo_no_longer_applies", detail: "Add $10.00 more to get 20% off." });
    expect(cart.promotionsNotApplied).toEqual([
      { promotionId: "promo-1", headline: "20% off", reason: "below_minimum", detail: "Add $10.00 more to get 20% off." },
    ]);
    // …and it applies again by itself once the cart recovers.
    w.products[A] = { ...milk, price: "50.00" };
    expect((await w.svc.get(CUSTOMER)).discount?.amount).toBe("10.00");
  });

  it("an automatic promotion applies with no code", async () => {
    const w = world({ [A]: { ...milk, price: "40.00" } });
    w.promos.set("auto", { code: null, candidate: { id: "auto", kind: "cart", valueType: "amount", amountOffCents: 500 }, words: { ...WORDS, valueType: "amount", percentOff: null, amountOffCents: 500 } });
    const cart = await w.svc.add(CUSTOMER, A, "c1", 1);
    expect(cart).toMatchObject({ discountAmount: "5.00", grandTotalAmount: "35.00", discount: null });
    expect(cart.promotions?.map((x) => x.code)).toEqual([null]);
  });

  it("prices the PAYABLE lines only - an unavailable line earns nothing", async () => {
    const w = world({ [A]: { ...milk, price: "50.00" }, [B]: { ...bread, price: "50.00", status: "unavailable" } });
    w.promos.set("promo-1", spring20());
    w.seedAtAdd(A, null);
    w.seedAtAdd(B, null);
    expect((await w.svc.applyPromo(CUSTOMER, "SPRING20")).discountAmount).toBe("10.00"); // 20% of 50, not of 100
    expect(w.priced.at(-1)?.lines.map((l) => l.productId)).toEqual([A]);
  });

  it("removing a code is idempotent", async () => {
    const w = world({ [A]: milk });
    await expect(w.svc.removePromo(CUSTOMER)).resolves.toMatchObject({ discount: null });
  });
});

describe("the minimum order value", () => {
  it("blocks below it, says how much more, and allows exactly at it", async () => {
    const w = world({ [A]: { ...milk, price: "10.00" } }, { minimumSubtotalCents: 2500 });
    const below = await w.svc.add(CUSTOMER, A, "c1", 2);
    expect(below.checkout).toEqual({ allowed: false, blockedReason: "below_minimum", minimumSubtotalAmount: "25.00", remainingAmount: "5.00" });
    w.products[A] = { ...milk, price: "12.50" };
    expect((await w.svc.get(CUSTOMER)).checkout).toMatchObject({ allowed: true, minimumSubtotalAmount: "25.00" });
  });

  it("is judged AFTER the discount - the amount actually charged", () => {
    const p = { ...defaultCartPolicy(), minimumSubtotalCents: 2500 };
    expect(checkoutState(1, 1, 2499, p).blockedReason).toBe("below_minimum");
    expect(checkoutState(1, 1, 2500, p).allowed).toBe(true);
  });

  it("with no minimum the cart says nothing about one", () => {
    expect(checkoutState(1, 1, 1, defaultCartPolicy())).toEqual({ allowed: true, blockedReason: null, minimumSubtotalAmount: null, remainingAmount: null });
  });
});

describe("guest preview", () => {
  it("re-prices a device cart in the client's order and writes nothing", async () => {
    const w = world({ [A]: milk, [B]: bread });
    const cart = await w.svc.preview([{ variantId: B, quantity: 1 }, { variantId: A, quantity: 2 }]);
    expect(cart.lines.map((l) => [l.productId, l.lineSubtotalAmount])).toEqual([[B, "9.00"], [A, "9.00"]]);
    expect(cart.revision).toBe(0);
    expect(cart.discount).toBeNull();
    expect(w.cart.size).toBe(0);
    expect(w.calls).toEqual([]);
  });

  it("reports a product that no longer exists, and excludes an archived one without trying to sweep", async () => {
    const w = world({ [A]: { ...milk, status: "archived" } });
    const cart = await w.svc.preview([{ variantId: A, quantity: 1 }, { variantId: B, quantity: 1 }]);
    expect(cart.lines).toEqual([]);
    expect(cart.notices).toEqual([
      { productId: null, variantId: B, kind: "removed", detail: null },
      { productId: A, variantId: A, kind: "removed", detail: "Oat Milk" },
    ]);
    expect(w.calls).toEqual([]);
  });

  it("applies the distinct-item ceiling, since no table constraint is in play", async () => {
    const w = world({ [A]: milk, [B]: bread }, { maxDistinctItems: 1 });
    expect((await w.svc.preview([{ variantId: A, quantity: 1 }, { variantId: B, quantity: 1 }])).lines).toHaveLength(1);
  });
});

describe("dedupe / payableCents", () => {
  it("sums duplicates, clamps to the ceiling, drops junk, keeps first-seen order", () => {
    const { ids, qty } = dedupe(
      [{ variantId: B, quantity: 2 }, { variantId: A, quantity: 60 }, { variantId: B, quantity: 3 }, { variantId: A, quantity: 60 },
      { variantId: "junk", quantity: 1 }, { variantId: C, quantity: 0 }, { variantId: C, quantity: 1.5 }],
      99,
    );
    expect(ids).toEqual([B, A]);
    expect([...qty]).toEqual([[B, 5], [A, 99]]);
  });

  it("payableCents counts only what can be bought, at the quantity that can be supplied", () => {
    const row = (over: Partial<CartLineRow>): CartLineRow => ({
      id: "l", product_id: A, variant_id: A, variant_label: null, age_restricted: false, variant_state: "active", pack_quantity: null, pack_unit: null, unit_basis: null,
      shop_id: "s", quantity: 2, name: "n", unit_price_amount: "10.00", currency: "AUD",
      status: "active", stock_tracked: false, stock_on_hand: null, storage_key: null, image_widths: null, unit_price_at_add: null, ...over,
    });
    expect(payableCents([row({}), row({ status: "unavailable" }), row({ stock_tracked: true, stock_on_hand: 1, quantity: 5 })])).toBe(2000 + 1000);
  });
});
