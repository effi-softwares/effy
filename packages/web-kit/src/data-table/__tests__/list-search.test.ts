import { describe, expect, it } from "vitest";

import { defineListSearch, isFiltered, searchFilter } from "../list-search";

const orders = defineListSearch({
  id: "orders",
  mode: "keyset",
  sorts: ["placed", "total"] as const,
  defaultSort: "placed",
  sortDir: { placed: "desc", total: "desc" },
  filters: {
    view: searchFilter.oneOf(["all", "driver", "handover"] as const),
    shopId: searchFilter.uuid,
    placedFrom: searchFilter.day,
    lowStock: searchFilter.flag,
  },
});

const ID = "3F2B8C1E-0000-4000-8000-000000000001";

describe("defineListSearch", () => {
  it("reads defaults from an empty address", () => {
    expect(orders.read({})).toEqual({ q: "", sort: "placed", dir: "desc", page: 1, size: 25, filters: {} });
  });

  it("keeps valid params and drops the rest - never throws", () => {
    const v = orders.read({ q: "milk", sort: "nonsense", dir: "up", page: "-2", size: "999", view: "driver", shopId: "x", placedFrom: "2026-10-01" });
    expect(v).toEqual({ q: "milk", sort: "placed", dir: "desc", page: 1, size: 25, filters: { view: "driver", placedFrom: "2026-10-01" } });
  });

  it("validateSearch leaves defaults out so addresses stay short", () => {
    expect(orders.validateSearch({ q: "", sort: "placed", dir: "desc", page: 1, size: 25 })).toEqual({});
    expect(orders.validateSearch({ sort: "total", page: "3", size: "50", lowStock: "true", shopId: ID })).toEqual({
      sort: "total",
      page: 3,
      size: 50,
      lowStock: true,
      shopId: ID.toLowerCase(),
    });
  });

  it("write replaces only this list's params and keeps the route's others", () => {
    const next = orders.write({ tab: "x", q: "old", page: 4 }, { ...orders.initial(), q: "new" });
    expect(next).toEqual({ tab: "x", q: "new" });
  });

  it("toQuery is the server's query string", () => {
    const view = { ...orders.initial(), q: " milk ", size: 50 as const, filters: { view: "driver" as const } };
    expect(orders.toQuery(view, "CUR").toString()).toBe("q=milk&sort=placed&dir=desc&pageSize=50&cursor=CUR&view=driver");
  });

  it("an offset list sends its page, not a cursor", () => {
    const shops = defineListSearch({ id: "shops", mode: "offset", sorts: ["code"] as const, defaultSort: "code", sortDir: { code: "asc" }, filters: {} });
    expect(shops.toQuery({ ...shops.initial(), page: 3 }, "CUR").toString()).toBe("sort=code&dir=asc&pageSize=25&page=3");
  });

  it("a prefixed list reads and writes only its own keys", () => {
    const pts = defineListSearch({ id: "points", mode: "keyset", sorts: ["at"] as const, defaultSort: "at", sortDir: { at: "desc" }, filters: {}, prefix: "pts" });
    expect(pts.read({ page: 5, "pts.page": 2 }).page).toBe(2);
    expect(pts.write({ page: 5, "pts.page": 2 }, pts.initial())).toEqual({ page: 5 });
  });

  it("isFiltered ignores the view select", () => {
    expect(isFiltered({ ...orders.initial(), filters: { view: "driver" } }, ["view"])).toBe(false);
    expect(isFiltered({ ...orders.initial(), filters: { view: "driver" } })).toBe(true);
    expect(isFiltered({ ...orders.initial(), q: "  x " })).toBe(true);
  });
});
