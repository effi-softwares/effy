import { describe, expect, it } from "vitest";

import { qualityOf, type Totals } from "./service";

const totals = (over: Partial<Totals> = {}): Totals => ({
  gross: 0,
  refunds: 0,
  refundedOrders: 0,
  orders: 0,
  units: 0,
  cantSupply: 0,
  cantSupplyUnits: 0,
  cancelled: 0,
  finishedOrders: 0,
  finishedUnitsOrdered: 0,
  finishedUnitsSupplied: 0,
  readyOrders: 0,
  readySeconds: 0,
  ...over,
});

describe("how well the shop fulfils (099)", () => {
  it("matches a hand count: 9 of 10 units found, 1 of 5 orders can't supply, ready in 20 min on average", () => {
    const q = qualityOf(
      totals({ finishedUnitsOrdered: 10, finishedUnitsSupplied: 9, finishedOrders: 5, cantSupply: 1, readyOrders: 4, readySeconds: 4 * 1200 }),
      totals(),
    );
    expect(q.foundRate?.value).toBe("90.0");
    expect(q.cantSupplyRate?.value).toBe("20.0");
    expect(q.averageTimeToReady?.value).toBe("1200");
    // Nothing to compare against: said so, not "+100%".
    expect(q.foundRate?.change).toEqual({ kind: "none", amount: null });
  });

  it("compares rates in percentage points and the time in percent", () => {
    const q = qualityOf(
      totals({ finishedUnitsOrdered: 10, finishedUnitsSupplied: 9, finishedOrders: 4, cantSupply: 0, readyOrders: 2, readySeconds: 2 * 900 }),
      totals({ finishedUnitsOrdered: 10, finishedUnitsSupplied: 8, finishedOrders: 4, cantSupply: 1, readyOrders: 2, readySeconds: 2 * 1200 }),
    );
    expect(q.foundRate?.change).toEqual({ kind: "abs", amount: "10.0" });
    expect(q.cantSupplyRate?.change).toEqual({ kind: "abs", amount: "-25.0" });
    expect(q.averageTimeToReady?.change).toEqual({ kind: "pct", amount: "-25" });
  });

  it("is null when the window has nothing to measure — never 0% or 100%", () => {
    const q = qualityOf(totals(), totals());
    expect(q).toEqual({ foundRate: null, cantSupplyRate: null, averageTimeToReady: null });
  });
});
