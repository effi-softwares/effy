import { describe, expect, it } from "vitest";

import { concentrationOf, paceOf } from "./service";

describe("how few products make most of the sales", () => {
  it("counts from the biggest until 80% is reached", () => {
    expect(concentrationOf([10, 50, 30, 10])).toEqual({ products: 4, top80: 2 });
  });

  it("is zero with nothing sold", () => {
    expect(concentrationOf([])).toEqual({ products: 0, top80: 0 });
  });
});

describe("where today is heading", () => {
  // A usual Thursday: 10 orders by noon, 20 in the day.
  const cells = [
    { weekday: 4, hour: 10, orders: 4 },
    { weekday: 4, hour: 11, orders: 6 },
    { weekday: 4, hour: 12, orders: 4 },
    { weekday: 4, hour: 15, orders: 6 },
    { weekday: 5, hour: 11, orders: 40 },
  ];

  it("divides what sold by the usual share of the day gone, counting the current hour by its minutes", () => {
    // 12:30: 4 + 6 + half of 4 = 12 of 20, so 60% of the day.
    expect(paceOf(cells, 4, 12, 30, { orders: 9, revenue: 300 })).toEqual({ orders: 15, revenue: "500.00" });
  });

  it("says nothing with too little of the day behind it", () => {
    expect(paceOf(cells, 4, 10, 0, { orders: 1, revenue: 30 })).toBeNull();
  });

  it("says nothing before anything sold, or on a weekday it has never sold", () => {
    expect(paceOf(cells, 4, 13, 0, { orders: 0, revenue: 0 })).toBeNull();
    expect(paceOf(cells, 1, 13, 0, { orders: 3, revenue: 90 })).toBeNull();
  });
});
