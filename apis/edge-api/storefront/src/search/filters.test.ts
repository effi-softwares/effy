import { describe, expect, it } from "vitest";

import { binder, cursorPredicate, filters, orderClause, TRIGRAM_EXPR, type SearchParams } from "./filters";

const base: SearchParams = {
  q: "", categoryKey: "", minPrice: "", maxPrice: "", saleOnly: false, brands: [], attributes: {},
  sort: "newest", cursor: null, limit: 25,
};

function build(p: Partial<SearchParams>) {
  const args: unknown[] = [];
  return { sql: filters({ ...base, ...p }, binder(args)), args };
}

describe("filters", () => {
  it("with nothing selected is the listing filter alone — status only, never stock", () => {
    const { sql, args } = build({});
    expect(sql).toBe("\nWHERE p.status = 'active'");
    expect(args).toEqual([]);
    expect(sql).not.toContain("stock_on_hand");
  });

  it("text search matches name, brand and short description against one bound pattern", () => {
    const { sql, args } = build({ q: "milk" });
    expect(args).toEqual(["%milk%"]);
    expect(sql).toContain("p.name ILIKE $1 OR p.brand ILIKE $1 OR p.short_description ILIKE $1");
  });

  it("binds every value — nothing a shopper typed is ever spliced into the SQL", () => {
    const hostile = "'; DROP TABLE product; --";
    const { sql, args } = build({ q: hostile, categoryKey: hostile, brands: [hostile], attributes: { [hostile]: [hostile] } });
    expect(sql).not.toContain("DROP TABLE");
    expect(JSON.stringify(args)).toContain("DROP TABLE");
  });

  it("numbers placeholders in order across category, price, sale and brand", () => {
    const { sql, args } = build({ categoryKey: "dairy", minPrice: "1.50", maxPrice: "9", saleOnly: true, brands: ["A", "B"] });
    expect(args).toEqual(["dairy", "1.50", "9", ["A", "B"]]);
    expect(sql).toContain("WHERE key = $1)");
    expect(sql).toContain("p.price_amount >= $2::numeric");
    expect(sql).toContain("p.price_amount <= $3::numeric");
    expect(sql).toContain("p.compare_at_amount > p.price_amount");
    expect(sql).toContain("p.brand = ANY($4::text[])");
  });

  it("an attribute facet is one EXISTS covering text, multi-select and boolean values", () => {
    const { sql, args } = build({ attributes: { dietary: ["vegan", "halal"], organic: ["true"] } });
    expect(args).toEqual(["dietary", ["vegan", "halal"], "organic", ["true"]]);
    expect(sql.match(/AND EXISTS/g)).toHaveLength(2); // AND across keys
    expect(sql).toContain("pav.value_text = ANY($2::text[]) OR pav.value_options && $2::text[] OR pav.value_boolean::text = ANY($2::text[])");
  });

  it("skips an attribute with no values rather than matching nothing", () => {
    expect(build({ attributes: { dietary: [] } }).sql).toBe("\nWHERE p.status = 'active'");
  });
});

describe("orderClause", () => {
  it.each([
    ["newest", "p.created_at DESC, p.id DESC"],
    ["price_asc", "p.price_amount ASC, p.id ASC"],
    ["price_desc", "p.price_amount DESC, p.id DESC"],
    ["relevance", "score DESC, p.id DESC"],
  ] as const)("%s orders by %s — always with the id tiebreak", (sort, want) => {
    expect(orderClause(sort)).toContain(want);
  });
});

describe("cursorPredicate", () => {
  const cur = { key: "K", id: "I" };
  const at = (sort: SearchParams["sort"], q = "") => {
    const args: unknown[] = [];
    const sql = cursorPredicate({ ...base, sort, q, cursor: { sort, ...cur } }, binder(args));
    return { sql, args };
  };

  it("walks the same direction as the ORDER BY", () => {
    expect(at("newest").sql).toContain("(p.created_at, p.id) < ($1::timestamptz, $2::uuid)");
    expect(at("price_desc").sql).toContain("(p.price_amount, p.id) < ($1::numeric, $2::uuid)");
    expect(at("price_asc").sql).toContain("(p.price_amount, p.id) > ($1::numeric, $2::uuid)");
  });

  it("relevance repeats the SAME similarity expression the select scores with", () => {
    const { sql, args } = at("relevance", "oat");
    expect(sql).toContain(`(similarity(${TRIGRAM_EXPR}, $1), p.id) < ($2::real, $3::uuid)`);
    expect(args).toEqual(["oat", "K", "I"]);
  });
});
