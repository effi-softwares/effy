import { describe, expect, it } from "vitest";

import { CARD_COLUMNS, deriveBadges, toCards, type CardRow } from "./cards";
import { attributeFacets, isUuid, nonEmptyValues, queryOf, splitCsv, validPrice } from "./request";

const NOW = Date.parse("2026-10-05T00:00:00Z");
const DAY = 24 * 3600_000;

const row = (over: Partial<CardRow> = {}): CardRow => ({
  id: "p1", name: "Oat milk", brand: "Oatly", price_amount: "4.50", currency: "AUD", compare_at_amount: null,
  storage_key: null, alt_text: null, created_at: new Date(NOW - 30 * DAY), created_at_key: "k", available: true, ...over,
});

describe("deriveBadges", () => {
  it("nothing for an old, full-price product", () => {
    expect(deriveBadges(row(), NOW)).toEqual([]);
  });
  it("on_sale when a compare-at price is present", () => {
    expect(deriveBadges(row({ compare_at_amount: "6.00" }), NOW)).toEqual(["on_sale"]);
  });
  it("new within 14 days, inclusive at the boundary", () => {
    expect(deriveBadges(row({ created_at: new Date(NOW - 14 * DAY) }), NOW)).toEqual(["new"]);
    expect(deriveBadges(row({ created_at: new Date(NOW - 14 * DAY - 1) }), NOW)).toEqual([]);
  });
  it("both, on_sale first", () => {
    expect(deriveBadges(row({ compare_at_amount: "6.00", created_at: new Date(NOW - DAY) }), NOW)).toEqual(["on_sale", "new"]);
  });
});

describe("toCards", () => {
  it("maps a row to the wire card with money as text", async () => {
    const [card] = await toCards([row({ storage_key: "products/a.jpg" })], async (k) => `signed:${k}`);
    expect(card).toEqual({
      id: "p1", name: "Oat milk", brand: "Oatly", imageUrl: "signed:products/a.jpg", priceAmount: "4.50",
      currency: "AUD", compareAtAmount: null, badges: [], available: true,
    });
  });

  it("an image that cannot be signed is null — it never fails the read", async () => {
    const [card] = await toCards([row({ storage_key: "products/a.jpg" })], async () => null);
    expect(card?.imageUrl).toBeNull();
  });

  it("keeps an unavailable product in the list and says so", async () => {
    const [card] = await toCards([row({ available: false })], async () => null);
    expect(card?.available).toBe(false);
  });

  it("an empty set is [] — never null on the wire", async () => {
    expect(await toCards([], async () => null)).toEqual([]);
  });
});

it("the card projection carries availability and the microsecond cursor key", () => {
  expect(CARD_COLUMNS).toContain("AS available");
  expect(CARD_COLUMNS).toContain("AS created_at_key");
  expect(CARD_COLUMNS).toContain("price_amount::text");
});

describe("request helpers", () => {
  const ev = (rawQueryString: string) => ({ rawQueryString }) as never;

  it("keeps each occurrence of a repeated parameter — a comma in a brand name is not a separator", () => {
    const q = queryOf(ev("brand=Ben%20%26%20Jerry%27s&brand=A%2C%20B"));
    expect(q.getAll("brand")).toEqual(["Ben & Jerry's", "A, B"]);
  });

  it("nonEmptyValues trims and drops blanks; nothing left is null", () => {
    expect(nonEmptyValues([" a ", "", "  ", "b"])).toEqual(["a", "b"]);
    expect(nonEmptyValues(["", " "])).toBeNull();
  });

  it("collects attr.<key> facets, OR within a key", () => {
    const q = queryOf(ev("attr.dietary=vegan&attr.dietary=halal&attr.organic=true&q=x&attr.empty="));
    expect(attributeFacets(q)).toEqual({ dietary: ["vegan", "halal"], organic: ["true"] });
    expect(attributeFacets(queryOf(ev("q=x")))).toBeNull();
  });

  it("splitCsv trims and drops empties", () => {
    expect(splitCsv("a, b,,c ,")).toEqual(["a", "b", "c"]);
  });

  it.each(["", "5", "5.50", ".5", "1e3", "-1"])("validPrice accepts %j", (s) => {
    expect(validPrice(s)).toBe(true);
  });
  it.each(["abc", "5,50", "$5", "1.2.3", " "])("validPrice refuses %j", (s) => {
    expect(validPrice(s)).toBe(false);
  });

  it("isUuid", () => {
    expect(isUuid("00000000-0000-0000-0000-000000000001")).toBe(true);
    expect(isUuid("00000000-0000-0000-0000-00000000000")).toBe(false);
    expect(isUuid("nope")).toBe(false);
    expect(isUuid(undefined)).toBe(false);
  });
});
