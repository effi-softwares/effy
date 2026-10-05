import { beforeEach, describe, expect, it, vi } from "vitest";

const announce = vi.fn(async (_changes: unknown) => undefined);
vi.mock("../live", () => ({ announce: (c: unknown) => announce(c) }));

import { announcePaid, type FinalizeOutcome } from "./finalize";

const paid = (over: Partial<FinalizeOutcome> = {}): FinalizeOutcome => ({
  applied: true,
  slotConfirmed: false,
  slotOverCapacity: false,
  stockShortfall: false,
  shopIds: ["shop-a", "shop-b"],
  customerSub: "sub-1",
  stockShopIds: [],
  ...over,
});

beforeEach(() => announce.mockClear());

describe("announcePaid (071)", () => {
  it("tells each fulfilling shop, the customer and operations that orders changed", async () => {
    await announcePaid(paid());
    expect(announce).toHaveBeenCalledExactlyOnceWith([
      { scope: "shop", shopId: "shop-a", kind: "orders" },
      { scope: "shop", shopId: "shop-b", kind: "orders" },
      { scope: "customer", sub: "sub-1", kind: "orders" },
      { scope: "ops", kind: "orders" },
    ]);
  });

  it("also tells operations the slot load changed when a same-day place was confirmed", async () => {
    await announcePaid(paid({ slotConfirmed: true }));
    expect(announce.mock.calls[0]![0]).toContainEqual({ scope: "ops", kind: "slots" });
  });

  it("tells a shop its stock changed when the sale reduced tracked stock", async () => {
    await announcePaid(paid({ stockShopIds: ["shop-a"] }));
    const changes = announce.mock.calls[0]![0] as unknown[];
    expect(changes).toContainEqual({ scope: "shop", shopId: "shop-a", kind: "stock" });
    expect(changes).not.toContainEqual({ scope: "shop", shopId: "shop-b", kind: "stock" });
  });

  it("says nothing for a redelivery — nothing was applied, so nothing changed", async () => {
    await announcePaid(paid({ applied: false, shopIds: [], customerSub: null }));
    expect(announce).not.toHaveBeenCalled();
  });

  // FR-024: the customer's update is one update whatever the number of shops, and names no shop.
  it("sends the customer exactly one change, with no shop in it, however many shops fulfil", async () => {
    await announcePaid(paid({ shopIds: ["shop-a", "shop-b", "shop-c"] }));
    const changes = announce.mock.calls[0]![0] as { scope: string }[];
    const forCustomer = changes.filter((c) => c.scope === "customer");
    expect(forCustomer).toEqual([{ scope: "customer", sub: "sub-1", kind: "orders" }]);
  });
});
