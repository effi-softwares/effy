import { describe, expect, it, vi } from "vitest";

vi.mock("@effy/edge-shared", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  query: vi.fn(),
  proposedRefundsForShop: vi.fn(),
}));

import { proposedRefundsForShop } from "@effy/edge-shared";

import { buildAttention, DEFAULT_TIMEZONE, readToday } from "./service";
import type { StockAttention, TodaySnapshot } from "./types";
import * as repo from "./repository";

const NOW = new Date("2026-09-14T04:00:00Z");

function snapshot(over: Partial<TodaySnapshot> = {}): TodaySnapshot {
  return {
    now: NOW,
    timezone: DEFAULT_TIMEZONE,
    backlog: {
      awaitingPick: { orders: 0, units: 0, oldestPaidAt: null },
      readyForPickup: 0,
      lowStock: { skus: 0, outOfStock: 0 },
    },
    stock: [],
    proposals: [],
    live: [],
    ...over,
  };
}

function stock(over: Partial<StockAttention> = {}): StockAttention {
  return {
    productId: "p1",
    name: "Beeswax wrap set",
    onHand: 0,
    soldLast7Days: 14,
    daysOfCover: null,
    severity: "out",
    since: new Date("2026-09-14T01:00:00Z"),
    ...over,
  };
}

describe("the needs-attention list (FR-004)", () => {
  it("puts owed work before empty shelves, and thin shelves last", () => {
    const view = buildAttention(
      snapshot({
        backlog: {
          awaitingPick: { orders: 3, units: 11, oldestPaidAt: new Date("2026-09-14T00:48:00Z") },
          readyForPickup: 2,
          lowStock: { skus: 2, outOfStock: 1 },
        },
        stock: [
          stock({ productId: "low", severity: "low", onHand: 3, daysOfCover: 5 }),
          stock({ productId: "out", severity: "out" }),
        ],
        proposals: [
          {
            fulfillmentId: "f1",
            orderNumber: "EFY-4413",
            amount: "5.40",
            since: new Date("2026-09-14T02:00:00Z"),
          },
        ],
      }),
    );

    // A shopper has already paid for everything in the backlog and is waiting on it; an empty shelf
    // costs the next sale; a thin shelf costs neither yet.
    expect(view.items.map((i) => i.kind)).toEqual([
      "awaiting_pick",
      "out_of_stock",
      "refund_proposed",
      "low_stock",
    ]);
  });

  it("collapses the whole pick backlog into ONE row", () => {
    const view = buildAttention(
      snapshot({
        backlog: {
          awaitingPick: { orders: 9, units: 30, oldestPaidAt: NOW },
          readyForPickup: 0,
          lowStock: { skus: 0, outOfStock: 0 },
        },
      }),
    );
    // Nine rows saying "go and pick" would push every other kind off an eight-row card.
    expect(view.items).toHaveLength(1);
    expect(view.items[0]).toMatchObject({ kind: "awaiting_pick", orders: 9, units: 30 });
  });

  it("shows nothing at all when nothing is waiting — the calm state, not a zeroed one", () => {
    const view = buildAttention(snapshot());
    expect(view.items).toEqual([]);
    expect(view.more).toBe(0);
    expect(view.oldestWaitingAt).toBeNull();
  });

  it("caps the card and reports the remainder honestly", () => {
    const many = Array.from({ length: 12 }, (_, i) =>
      stock({ productId: `p${i}`, name: `Product ${i}`, severity: "out" }),
    );
    const view = buildAttention(snapshot({ stock: many }));
    expect(view.items).toHaveLength(8);
    expect(view.more).toBe(4);
  });

  it("⚠ quotes the oldest item across EVERY open item, not just the visible ones", () => {
    const ancient = new Date("2026-09-01T00:00:00Z");
    const many = [
      ...Array.from({ length: 10 }, (_, i) =>
        stock({ productId: `p${i}`, severity: "out", since: new Date("2026-09-14T03:00:00Z") }),
      ),
      // Sorts last (low stock), so the cap hides it — and it is the oldest thing in the shop.
      stock({ productId: "ancient", severity: "low", onHand: 2, since: ancient }),
    ];
    const view = buildAttention(snapshot({ stock: many }));
    expect(view.items.some((i) => "productId" in i && i.productId === "ancient")).toBe(false);
    expect(view.oldestWaitingAt?.toISOString()).toBe(ancient.toISOString());
  });
});

describe("the snapshot", () => {
  it("⚠ asks for no proposals at all when the operator may not refund", async () => {
    vi.spyOn(repo, "readClock").mockResolvedValue({
      timezone: DEFAULT_TIMEZONE,
      rawTimezone: DEFAULT_TIMEZONE,
      now: NOW,
    });
    vi.spyOn(repo, "readBacklog").mockResolvedValue(snapshot().backlog);
    vi.spyOn(repo, "readStockAttention").mockResolvedValue([]);
    vi.spyOn(repo, "readLiveOrders").mockResolvedValue([]);

    const out = await readToday(
      { sub: "sub-staff", shopId: "shop-1", staffId: "staff-1" },
      { canRefund: async () => false },
    );

    expect(out.proposals).toEqual([]);
    // Not "fetched then filtered": a proposal is the platform saying it may owe a customer money,
    // and a staff operator is never sent one to hide (Principle IV — the record decides).
    expect(proposedRefundsForShop).not.toHaveBeenCalled();
  });

  it("groups a manager's proposals to ONE row per order, summing the lines", async () => {
    vi.spyOn(repo, "readClock").mockResolvedValue({
      timezone: DEFAULT_TIMEZONE,
      rawTimezone: DEFAULT_TIMEZONE,
      now: NOW,
    });
    vi.spyOn(repo, "readBacklog").mockResolvedValue(snapshot().backlog);
    vi.spyOn(repo, "readStockAttention").mockResolvedValue([]);
    vi.spyOn(repo, "readLiveOrders").mockResolvedValue([]);
    vi.mocked(proposedRefundsForShop).mockResolvedValue([
      {
        shop_fulfillment_id: "f1",
        order_id: "o1",
        order_number: "EFY-4413",
        order_item_id: "i1",
        product_name: "Milk",
        quantity: 1,
        amount: "3.40",
        since: new Date("2026-09-14T02:00:00Z"),
      },
      {
        shop_fulfillment_id: "f1",
        order_id: "o1",
        order_number: "EFY-4413",
        order_item_id: "i2",
        product_name: "Eggs",
        quantity: 1,
        amount: "2.00",
        since: new Date("2026-09-14T01:00:00Z"),
      },
    ]);

    const out = await readToday(
      { sub: "sub-manager", shopId: "shop-1", staffId: "staff-1" },
      { canRefund: async () => true },
    );

    // One order, one decision — two lines short of the same order is not two things to approve.
    expect(out.proposals).toEqual([
      {
        fulfillmentId: "f1",
        orderNumber: "EFY-4413",
        amount: "5.40",
        since: new Date("2026-09-14T01:00:00Z"),
      },
    ]);
  });

  it("falls back to the platform timezone when a shop's is unrecognised", async () => {
    vi.spyOn(repo, "readClock").mockResolvedValue({
      timezone: null,
      rawTimezone: "Mars/Olympus",
      now: NOW,
    });
    vi.spyOn(repo, "readBacklog").mockResolvedValue(snapshot().backlog);
    vi.spyOn(repo, "readStockAttention").mockResolvedValue([]);
    vi.spyOn(repo, "readLiveOrders").mockResolvedValue([]);

    const out = await readToday(
      { sub: "s", shopId: "shop-1", staffId: null },
      { canRefund: async () => false },
    );
    // A wrong day is worse than a default one: every boundary on both screens hangs off this.
    expect(out.timezone).toBe(DEFAULT_TIMEZONE);
  });
});
