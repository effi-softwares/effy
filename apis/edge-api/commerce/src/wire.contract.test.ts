import { keyPaths, kotlinFixture, kotlinFixtureJson, wire } from "@effy/edge-shared/testing";
import type { QuoteResult } from "@effy/edge-shared/delivery";
import type { PaymentGateway } from "@effy/edge-shared/payments";
import { describe, expect, it } from "vitest";

import { toQuoteDTO } from "./checkout/quote";
import { billingDetailsFrom, createCheckoutService } from "./checkout/service";
import { createOrdersService } from "./orders/service";
import type { ListRow, ListSummaryRow, SavedRepository } from "./saved/repository";
import { createSavedService } from "./saved/service";

/**
 * ⚠ WHAT THE MOBILE APP DECODES IS WHAT THIS SERVICE SENDS (070 FR-035).
 *
 * Each fixture below is read out of the mobile app's own contract test — the literal it proves it
 * can decode — and compared with what the REAL mapper here produces from equivalent data. Not a
 * hand-built object shaped like the fixture: 029 found a pair of tests agreeing with each other
 * about a payload no server had ever emitted.
 *
 * A renamed field typechecks on both sides and passes every unit test on both sides. The shopper
 * finds it.
 */
const SAVED = "features/saved/SavedWireContractTest.kt";
const PAYMENT = "features/payment/PaymentWireContractTest.kt";
const DELIVERY = "features/checkout/DeliveryWireContractTest.kt";

const EGGS = "9f2c1d4e-0000-0000-0000-000000000001";
const MILK = "1a7b0000-0000-0000-0000-000000000002";

function savedWith(over: Partial<SavedRepository>) {
  const repo = { membershipIds: async () => [], namedProductIds: async () => [], list: async () => [], lists: async () => [], ...over } as SavedRepository;
  return createSavedService({ repo, addToCart: async () => undefined, presign: async (k) => (k ? `https://media.example/${k}` : null) });
}

describe("saved items and lists", () => {
  it("a saved item", async () => {
    const row: ListRow = {
      product_id: EGGS, name: "Free Range Eggs 12pk", brand: "Effy", price_amount: "6.50", currency: "AUD", compare_at_amount: "8.00",
      storage_key: "eggs.jpg", saved_at: new Date("2026-07-20T04:11:00.000Z"), saved_price_amount: "8.00", category_key: "dairy-eggs",
      is_new: false, price_dropped: true, verdict: "purchasable",
    };
    const [item] = await savedWith({ list: async () => [row] }).list("c", "default");
    expect(wire(item)).toEqual(kotlinFixtureJson(SAVED, "SAVED_ITEM_WIRE_JSON"));
  });

  it("a saved item with nothing to say omits the optional keys rather than sending null", async () => {
    const row: ListRow = {
      product_id: "p1", name: "Milk", brand: null, price_amount: "3.10", currency: "AUD", compare_at_amount: null, storage_key: null,
      saved_at: new Date("2026-07-20T04:11:00Z"), saved_price_amount: "3.10", category_key: null, is_new: false, price_dropped: false, verdict: "purchasable",
    };
    const [item] = await savedWith({ list: async () => [row] }).list("c", "default");
    // The literal the mobile test decodes for exactly this case.
    expect(JSON.stringify(item)).toBe(
      `{"id":"p1","name":"Milk","brand":null,"imageUrl":null,"priceAmount":"3.10","currency":"AUD","compareAtAmount":null,"badges":[],"savedAt":"2026-07-20T04:11:00Z","savedPriceAmount":"3.10","verdict":"purchasable"}`,
    );
  });

  it("membership — and its count is a whole number on the wire", async () => {
    const m = await savedWith({ membershipIds: async () => [EGGS, MILK], namedProductIds: async () => [EGGS] }).membership("c");
    expect(wire(m)).toEqual(kotlinFixtureJson(SAVED, "SAVED_MEMBERSHIP_WIRE_JSON"));
    expect(JSON.stringify(m)).toContain(`"count":2`);
    // A shopper with nothing saved gets [], never null: a client iterating it must not crash.
    expect(JSON.stringify(await savedWith({}).membership("c"))).toBe(`{"productIds":[],"count":0,"namedProductIds":[]}`);
  });

  it("lists — the default list is addressed as \"default\", and `containsProduct` is absent unless a product was named", async () => {
    const [wantDefault, wantNamed] = kotlinFixtureJson(SAVED, "SAVED_LISTS_WIRE_JSON") as [unknown, unknown];
    const rows: ListSummaryRow[] = [
      { id: "0d000000-0000-0000-0000-00000000000d", is_default: true, name: null, count: 12, only_here: 9, contains: false },
      { id: "5d1e0000-0000-0000-0000-000000000005", is_default: false, name: "Weekly Items", count: 5, only_here: 2, contains: true },
    ];
    const svc = savedWith({ lists: async () => rows });

    const plain = await svc.lists("c", null);
    expect(wire(plain[0])).toEqual(wantDefault);
    expect(JSON.stringify(plain)).not.toContain("0d000000"); // the default list's real id never reaches the wire
    expect(JSON.stringify(plain)).not.toContain("containsProduct");

    const forProduct = await svc.lists("c", EGGS);
    expect(wire(forProduct[1])).toEqual(wantNamed);
  });
});

describe("payment methods and billing details", () => {
  const cards = [
    { id: "pm_123", brand: "visa", last4: "4242", expMonth: 4, expYear: 2028, isDefault: true },
    { id: "pm_456", brand: "mastercard", last4: "8210", expMonth: 7, expYear: 2026, isDefault: false },
  ];
  const svc = createCheckoutService({
    store: { paymentProfile: async () => ({ providerCustomerId: "cus_1", email: "", name: "" }) } as never,
    gateway: { listSavedCards: async () => cards } as unknown as PaymentGateway,
    policy: async () => ({}) as never, promos: async () => ({ cents: 0, promo: null }), quoter: async () => ({ serviced: false }) as never, publishableKey: "",
  });

  it("a usable card and an expired one", async () => {
    const [usable, expired] = await svc.listKeptCards("c", new Date("2026-10-05T00:00:00Z"));
    // Byte-for-byte: the expiry fields must be integers, and `unusableReason` absent when usable.
    expect(JSON.stringify(usable)).toBe(kotlinFixture(PAYMENT, "PAYMENT_METHOD"));
    expect(JSON.stringify(expired)).toBe(kotlinFixture(PAYMENT, "PAYMENT_METHOD_UNUSABLE"));
  });

  it("billing details, derived from the order's own address snapshot", () => {
    const snapshot = { recipientName: "Jane Smith", phone: null, line1: "1 Test St", line2: null, city: "Richmond", region: "VIC", postalCode: "3121", country: "AU" };
    expect(JSON.stringify(billingDetailsFrom(snapshot, "", "jane@example.com"))).toBe(kotlinFixture(PAYMENT, "BILLING_DETAILS"));
  });
});

describe("the delivery quote", () => {
  // 12:20 Melbourne (AEST) less the 30-minute validity.
  const now = new Date("2026-08-24T01:50:00Z");
  const slot = {
    id: "33333333-3333-3333-3333-333333333333", date: "2026-08-24",
    start: new Date("2026-08-24T07:00:00Z"), end: new Date("2026-08-24T09:00:00Z"), cutoff: new Date("2026-08-24T03:00:00Z"),
  };

  /** A priced fee as the quote carries it (077): only the lines and the total reach the wire. */
  const priced = (totalCents: number, withoutPremiumCents = totalCents) => ({
    planId: "p", planName: "P", slotId: null, windowIsToday: false, breakdown: {}, totalCents,
    lines: [
      { kind: "delivery", cents: withoutPremiumCents },
      ...(totalCents > withoutPremiumCents ? [{ kind: "window_surcharge", cents: totalCents - withoutPremiumCents }] : []),
    ],
  });

  /** The quote as the shared library hands it over when Effy delivers (083: windows, nothing else). */
  const effy = (over: Record<string, unknown>) => ({
    serviced: true, coverage: "effy", zoneId: null, shopIds: ["a-shop", "b-shop"], baseFee: priced(600), freeDeliveryRemainingCents: null, ...over,
  }) as unknown as QuoteResult;
  const day = (date: string, isToday: boolean, windows: unknown[], closedReason: string | null) => ({ date, isToday, nonDelivery: false, windows, closedReason });

  it("windows on offer — byte for byte: one fee per window, every time with the Melbourne offset, nothing about suppliers", () => {
    const q = effy({
      freeDeliveryRemainingCents: 2600,
      effyWindows: {
        days: [day("2026-08-24", true, [slot], null), day("2026-08-25", false, [], "full")],
        fees: new Map([[`${slot.id}|2026-08-24`, priced(1100, 600)]]),
        unavailable: null,
      },
    });
    const got = JSON.stringify(toQuoteDTO("3121", q, now));
    expect(got).toBe(kotlinFixture(DELIVERY, "DELIVERY_QUOTE_WIRE"));
    expect(got).not.toMatch(/shop|package|pkg-/);
  });

  it("no window anywhere — byte for byte", () => {
    const q = effy({ effyWindows: { days: [day("2026-08-24", true, [], "closed")], fees: new Map(), unavailable: "no_windows" } });
    expect(JSON.stringify(toQuoteDTO("3121", q, now))).toBe(kotlinFixture(DELIVERY, "DELIVERY_QUOTE_NO_WINDOWS_WIRE"));
  });
});

describe("an order line", () => {
  it("is what the reorder and refund-request screens decode", async () => {
    const orders = createOrdersService({
      repo: {
        get: async () => ({
          id: "11111111-1111-4111-8111-111111111111", order_number: "EFY-1", status: "paid", placed_at: null, delivery_address: {}, billing_address: null,
          delivery_handover: null, delivery_note: null, item_subtotal_amount: "13.00", discount_amount: "0.00", promo_code: null,
          delivery_fee_amount: "0.00", grand_total_amount: "13.00", currency: "AUD", payment_status: "succeeded",
        }),
        items: async () => [{ order_item_id: "1a2b3c4d-0000-0000-0000-000000000009", product_id: EGGS, product_name: "Free Range Eggs 12pk", unit_price_amount: "6.50", quantity: 2, line_subtotal_amount: "13.00", image_key: null }],
        fulfillments: async () => [], shortfalls: async () => [], arrivals: async () => [], paymentMethod: async () => null, refunds: async () => [], list: async () => [],
      },
      presign: async () => null,
    });
    const order = await orders.get({ log: { warn: () => undefined } } as never, "c", "11111111-1111-4111-8111-111111111111");
    expect(JSON.stringify(order.items[0])).toBe(
      `{"orderItemId":"1a2b3c4d-0000-0000-0000-000000000009","productId":"${EGGS}","productName":"Free Range Eggs 12pk","unitPriceAmount":"6.50","quantity":2,"lineSubtotalAmount":"13.00"}`,
    );
  });
});
