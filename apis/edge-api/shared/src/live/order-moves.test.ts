import { describe, expect, it, vi } from "vitest";

const announce = vi.hoisted(() => vi.fn(async (_c: unknown) => undefined));
vi.mock("./announce", () => ({ announce }));

import { announceMoves, changesForMoves } from "./order-moves";

const row = (id: string, order: string, shop: string, status: string) => ({
  id, order_id: order, shop_id: shop, status, cognito_sub: `sub-${order}`,
});
const CUSTOMER = { scope: "customer", sub: "sub-o1", kind: "orders" };

describe("changesForMoves", () => {
  it("one shop, one package: the shop, operations and the customer hear when the stage moves", () => {
    const changes = changesForMoves([row("f1", "o1", "shopA", "collected")], [{ fulfillmentId: "f1", from: "ready_for_pickup" }], true);
    expect(changes).toEqual([{ scope: "shop", shopId: "shopA", kind: "orders" }, CUSTOMER, { scope: "ops", kind: "orders" }]);
  });

  it("a move inside one customer stage tells the shop and operations, not the customer", () => {
    // received → picking: both are "packing" on the customer's page.
    const changes = changesForMoves([row("f1", "o1", "shopA", "picking")], [{ fulfillmentId: "f1", from: "received" }], true);
    expect(changes).toEqual([{ scope: "shop", shopId: "shopA", kind: "orders" }, { scope: "ops", kind: "orders" }]);
  });

  // FR-024 / SC-011 — the split order.
  describe("an order split across two shops", () => {
    it("the FASTER shop's package being collected tells the customer nothing", () => {
      const rows = [row("f1", "o1", "shopA", "collected"), row("f2", "o1", "shopB", "picking")];
      const changes = changesForMoves(rows, [{ fulfillmentId: "f1", from: "ready_for_pickup" }], true);
      expect(changes).not.toContainEqual(CUSTOMER);
      // And only the shop whose package moved is told — the other shop's screen did not change.
      expect(changes.filter((c) => c.scope === "shop")).toEqual([{ scope: "shop", shopId: "shopA", kind: "orders" }]);
    });

    it("the SLOWER shop's package being collected is the moment the customer hears", () => {
      const rows = [row("f1", "o1", "shopA", "collected"), row("f2", "o1", "shopB", "collected")];
      const changes = changesForMoves(rows, [{ fulfillmentId: "f2", from: "ready_for_pickup" }], true);
      expect(changes.filter((c) => c.scope === "customer")).toEqual([CUSTOMER]);
    });

    it("across the whole journey the customer hears exactly as often as on a one-shop order", () => {
      const journey = ["received", "picking", "ready_for_pickup", "collected", "delivered"];
      const heard = (shops: number) => {
        const status = Array.from({ length: shops }, () => "pending");
        let n = 0;
        // Each shop advances one step at a time, shop 0 always first.
        for (const next of journey) {
          for (let s = 0; s < shops; s++) {
            const from = status[s]!;
            status[s] = next;
            const rows = status.map((st, i) => row(`f${i}`, "o1", `shop${i}`, st));
            if (changesForMoves(rows, [{ fulfillmentId: `f${s}`, from }], true).some((c) => c.scope === "customer")) n++;
          }
        }
        return n;
      };
      expect(heard(2)).toBe(heard(1));
      expect(heard(3)).toBe(heard(1));
      expect(heard(1)).toBe(3); // confirmed → packing → on the way → delivered
    });

    it("no change sent to a customer can carry a shop", () => {
      const rows = [row("f1", "o1", "shopA", "delivered"), row("f2", "o1", "shopB", "delivered")];
      const changes = changesForMoves(rows, [{ fulfillmentId: "f2", from: "collected" }], true);
      for (const c of changes.filter((x) => x.scope === "customer")) {
        expect(Object.keys(c).sort()).toEqual(["kind", "scope", "sub"]);
      }
    });
  });

  it("pick progress (no status change) tells the shop only when operations is left out", () => {
    const changes = changesForMoves([row("f1", "o1", "shopA", "picking")], [{ fulfillmentId: "f1", from: null }], false);
    expect(changes).toEqual([{ scope: "shop", shopId: "shopA", kind: "orders" }]);
  });

  it("several packages across several orders each tell their own shop and customer", () => {
    const rows = [row("f1", "o1", "shopA", "collected"), row("f2", "o2", "shopA", "collected")];
    const changes = changesForMoves(rows, [{ fulfillmentId: "f1", from: "ready_for_pickup" }, { fulfillmentId: "f2", from: "ready_for_pickup" }], true);
    expect(changes.filter((c) => c.scope === "customer")).toEqual([CUSTOMER, { scope: "customer", sub: "sub-o2", kind: "orders" }]);
    expect(changes.filter((c) => c.scope === "ops")).toHaveLength(1);
  });
});

describe("announceMoves", () => {
  it("never rejects when the read fails, and still sends what does not depend on it", async () => {
    announce.mockClear();
    const db = { query: vi.fn(async () => { throw new Error("database is stopped"); }) };
    await expect(
      announceMoves([{ fulfillmentId: "f1", from: "picking" }], { db: db as never, also: [{ scope: "ops", kind: "dispatch" }] }),
    ).resolves.toBeUndefined();
    expect(announce).toHaveBeenCalledExactlyOnceWith([{ scope: "ops", kind: "dispatch" }]);
  });

  it("with no moves, sends only the extra changes and reads nothing", async () => {
    announce.mockClear();
    const db = { query: vi.fn() };
    await announceMoves([], { db: db as never, also: [{ scope: "driver", driverId: "d1", kind: "work" }] });
    expect(db.query).not.toHaveBeenCalled();
    expect(announce).toHaveBeenCalledExactlyOnceWith([{ scope: "driver", driverId: "d1", kind: "work" }]);
  });
});
