import { describe, expect, it } from "vitest";

import type { CardRow } from "../lib/cards";
import { decodeCursor, encodeCursor } from "./cursor";
import type { SearchParams } from "./filters";
import type { SearchRepository, SearchRow } from "./repository";
import { createSearchService, CursorSortMismatchError, cursorKeyFor, SEARCH_LIMIT, type SearchQuery } from "./service";

const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;

const row = (n: number, over: Partial<SearchRow> = {}): SearchRow => ({
  id: id(n), name: `P${n}`, brand: null, price_amount: `${n}.00`, currency: "AUD",
  compare_at_amount: null, storage_key: null, alt_text: null,
  created_at: new Date("2020-01-01T00:00:00Z"), created_at_key: `2020-01-01T00:00:00.00000${n % 10}Z`,
  available: true, score: 0.5, ...over,
});

function fake(rows: SearchRow[], total = rows.length) {
  const seen: SearchParams[] = [];
  const repo: SearchRepository = {
    searchCards: async (p) => {
      seen.push(p);
      return rows.slice(0, p.limit);
    },
    countCards: async () => total,
    cardsByIds: async (ids) => rows.filter((r) => ids.includes(r.id)) as CardRow[],
  };
  return { svc: createSearchService(repo, async () => null), seen };
}

const query = (over: Partial<SearchQuery> = {}): SearchQuery => ({
  q: "", categoryKey: "", minPrice: "", maxPrice: "", saleOnly: false, brands: [], attributes: {},
  sort: "newest", cursor: "", limit: 0, ...over,
});

describe("search", () => {
  it("defaults the page size and asks for one extra row to learn whether more exist", async () => {
    const { svc, seen } = fake(Array.from({ length: 30 }, (_, i) => row(i + 1)));
    const res = await svc.search(query());
    expect(seen[0]?.limit).toBe(SEARCH_LIMIT + 1);
    expect(res.items).toHaveLength(SEARCH_LIMIT);
    expect(res.nextCursor).not.toBeNull();
  });

  it.each([0, -5, 51, 1000])("an out-of-range limit (%d) becomes the default, not the maximum", async (limit) => {
    const { svc, seen } = fake([]);
    await svc.search(query({ limit }));
    expect(seen[0]?.limit).toBe(SEARCH_LIMIT + 1);
  });

  it("honours an in-range limit", async () => {
    const { svc, seen } = fake([]);
    await svc.search(query({ limit: 50 }));
    expect(seen[0]?.limit).toBe(51);
  });

  it("the last page has no cursor", async () => {
    const { svc } = fake([row(1), row(2)]);
    expect((await svc.search(query())).nextCursor).toBeNull();
  });

  it("the cursor points at the last row SHOWN, not the lookahead row", async () => {
    const { svc } = fake(Array.from({ length: 4 }, (_, i) => row(i + 1)));
    const res = await svc.search(query({ limit: 3 }));
    expect(decodeCursor(res.nextCursor!)).toEqual({ sort: "newest", key: row(3).created_at_key, id: id(3) });
  });

  it("reports the total across all pages, not the page length", async () => {
    const { svc } = fake([row(1)], 137);
    expect((await svc.search(query())).total).toBe(137);
  });

  it("relevance with no text falls back to newest AND says so", async () => {
    const { svc, seen } = fake([]);
    const res = await svc.search(query({ sort: "relevance" }));
    expect(res.sort).toBe("newest");
    expect(seen[0]?.sort).toBe("newest");
  });

  it("relevance with text stays relevance", async () => {
    const { svc } = fake([]);
    expect((await svc.search(query({ sort: "relevance", q: "oat" }))).sort).toBe("relevance");
  });

  it("a cursor from a different sort is refused, never reinterpreted", async () => {
    const { svc } = fake([]);
    const priceCursor = encodeCursor({ sort: "price_asc", key: "1.00", id: id(1) });
    await expect(svc.search(query({ sort: "newest", cursor: priceCursor }))).rejects.toBeInstanceOf(CursorSortMismatchError);
  });

  it("a malformed cursor restarts from the first page instead of failing", async () => {
    const { svc, seen } = fake([row(1)]);
    await expect(svc.search(query({ cursor: "!!!!" }))).resolves.toBeDefined();
    expect(seen[0]?.cursor).toBeNull();
  });

  it("a valid cursor is passed through decoded", async () => {
    const { svc, seen } = fake([]);
    await svc.search(query({ cursor: encodeCursor({ sort: "newest", key: "k", id: id(9) }) }));
    expect(seen[0]?.cursor).toEqual({ sort: "newest", key: "k", id: id(9) });
  });

  it("serialises an empty result as [] and null, never as absent", async () => {
    const { svc } = fake([]);
    expect(await svc.search(query())).toEqual({ items: [], nextCursor: null, total: 0, sort: "newest" });
  });
});

describe("cursorKeyFor", () => {
  it("price sorts use the price TEXT — money never passes through a float", () => {
    expect(cursorKeyFor("price_asc", row(1, { price_amount: "12.30" }))).toBe("12.30");
    expect(cursorKeyFor("price_desc", row(1, { price_amount: "0.10" }))).toBe("0.10");
  });
  it("newest uses the microsecond text key, not the millisecond Date", () => {
    expect(cursorKeyFor("newest", row(1, { created_at_key: "2026-01-01T00:00:00.123456Z" }))).toBe("2026-01-01T00:00:00.123456Z");
  });
  it("relevance prints the score back as the database sent it", () => {
    expect(cursorKeyFor("relevance", row(1, { score: 0.4285714 }))).toBe("0.4285714");
  });
});

describe("cardsByIds", () => {
  it("preserves the caller's order and drops ids that are gone", async () => {
    const { svc } = fake([row(1), row(2), row(3)]);
    const res = await svc.cardsByIds([id(3), id(99), id(1)]);
    expect(res.map((c) => c.id)).toEqual([id(3), id(1)]);
  });

  it("drops an id that is not a uuid instead of failing the whole rail", async () => {
    const { svc } = fake([row(1)]);
    expect((await svc.cardsByIds(["not-a-uuid", id(1)])).map((c) => c.id)).toEqual([id(1)]);
  });

  it("an empty list is an empty list, with no query", async () => {
    const { svc, seen } = fake([row(1)]);
    expect(await svc.cardsByIds([])).toEqual([]);
    expect(seen).toHaveLength(0);
  });
});
