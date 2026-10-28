import { describe, expect, it } from "vitest";

import {
  cappedCountSql,
  decodeCursor,
  encodeCursor,
  keysetColumns,
  keysetCondition,
  keysetListPage,
  likePattern,
  listFilter,
  ListQueryError,
  offsetListPage,
  orderBy,
  pageClause,
  parseListQuery,
  prefixPattern,
  runOffsetPage,
  type ListSpec,
} from "./list-query";

type Sort = "name" | "placed";
interface Filters {
  status: "active" | "suspended";
  shopId: string;
  from: string;
  hasOrdered: boolean;
}

const spec = (mode: "offset" | "keyset"): ListSpec<Sort, Filters> => ({
  mode,
  sorts: {
    name: { sql: "d.name", dir: "asc", type: "text" },
    placed: { sql: "o.created_at", dir: "desc", type: "timestamptz" },
  },
  defaultSort: "placed",
  idSql: "o.id",
  filters: {
    status: listFilter.oneOf(["active", "suspended"] as const),
    shopId: listFilter.uuid,
    from: listFilter.day,
    hasOrdered: listFilter.bool,
  },
});

const ID = "3f2b8c1e-0000-4000-8000-000000000001";

describe("parseListQuery", () => {
  it("defaults everything", () => {
    const r = parseListQuery(undefined, spec("offset"));
    expect(r).toMatchObject({ q: null, sort: "placed", dir: "desc", pageSize: 25, page: 1, cursor: null, ignored: [], viewsOnly: false });
  });

  it("trims search and treats blank as absent", () => {
    expect(parseListQuery({ q: "  milk " }, spec("offset")).q).toBe("milk");
    expect(parseListQuery({ q: "   " }, spec("offset")).q).toBeNull();
  });

  it("refuses search over 100 characters", () => {
    expect(() => parseListQuery({ q: "x".repeat(101) }, spec("offset"))).toThrow(ListQueryError);
  });

  it("falls back to the default sort on an unknown one, never an error", () => {
    expect(parseListQuery({ sort: "DROP TABLE" }, spec("offset")).sort).toBe("placed");
    expect(parseListQuery({ sort: "toString" }, spec("offset")).sort).toBe("placed");
  });

  it("takes the sort's own direction unless one is asked", () => {
    expect(parseListQuery({ sort: "name" }, spec("offset")).dir).toBe("asc");
    expect(parseListQuery({ sort: "name", dir: "desc" }, spec("offset")).dir).toBe("desc");
    expect(parseListQuery({ sort: "name", dir: "sideways" }, spec("offset")).dir).toBe("asc");
  });

  it("only offers 25, 50 and 100 rows", () => {
    expect(parseListQuery({ pageSize: "50" }, spec("offset")).pageSize).toBe(50);
    expect(parseListQuery({ pageSize: "1000" }, spec("offset")).pageSize).toBe(25);
    expect(parseListQuery({ pageSize: "abc" }, spec("offset")).pageSize).toBe(25);
  });

  it("reads a bad page as page 1", () => {
    expect(parseListQuery({ page: "0" }, spec("offset")).page).toBe(1);
    expect(parseListQuery({ page: "-3" }, spec("offset")).page).toBe(1);
    expect(parseListQuery({ page: "2.5" }, spec("offset")).page).toBe(1);
    expect(parseListQuery({ page: "4" }, spec("offset")).page).toBe(4);
  });

  it("refuses an offset page past 10 000 rows", () => {
    expect(() => parseListQuery({ page: "401", pageSize: "25" }, spec("offset"))).toThrow(/Narrow the search/);
    expect(parseListQuery({ page: "400", pageSize: "25" }, spec("offset")).page).toBe(400);
    // A keyset list has no depth limit by page number.
    expect(parseListQuery({ page: "9999" }, spec("keyset")).page).toBe(9999);
  });

  it("keeps known filter values and lists the unknown ones it dropped", () => {
    const r = parseListQuery(
      { status: "active", shopId: "not-a-uuid", from: "2026-02-30", hasOrdered: "true" },
      spec("offset"),
    );
    expect(r.filters).toEqual({ status: "active", hasOrdered: true });
    expect(r.ignored.sort()).toEqual(["from", "shopId"]);
  });

  it("decodes a keyset cursor; a malformed one restarts the list", () => {
    const c = encodeCursor("2026-10-28 10:00:00.123456+00", ID);
    expect(parseListQuery({ cursor: c }, spec("keyset")).cursor).toEqual({ value: "2026-10-28 10:00:00.123456+00", id: ID });
    expect(parseListQuery({ cursor: "garbage!!" }, spec("keyset")).cursor).toBeNull();
    // An offset list ignores a cursor.
    expect(parseListQuery({ cursor: c }, spec("offset")).cursor).toBeNull();
  });

  it("recognises the views-only ask", () => {
    expect(parseListQuery({ views: "only" }, spec("offset")).viewsOnly).toBe(true);
  });
});

describe("SQL fragments", () => {
  it("orders by the whitelisted expression, then the id in the same direction", () => {
    const r = parseListQuery({ sort: "name", dir: "desc" }, spec("offset"));
    expect(orderBy(spec("offset"), r)).toBe("ORDER BY d.name DESC, o.id DESC");
  });

  it("builds a direction-aware row comparison for a keyset page", () => {
    const s = spec("keyset");
    const args: unknown[] = ["x"];
    const r = parseListQuery({ cursor: encodeCursor("v", ID) }, s);
    expect(keysetCondition(s, r, args)).toBe("(o.created_at, o.id) < ($2::timestamptz, $3::uuid)");
    expect(args).toEqual(["x", "v", ID]);
    const asc = parseListQuery({ cursor: encodeCursor("v", ID), sort: "name" }, s);
    expect(keysetCondition(s, asc, [])).toBe("(d.name, o.id) > ($1::text, $2::uuid)");
    expect(keysetCondition(s, parseListQuery({}, s), [])).toBeNull();
  });

  it("selects the cursor columns as text", () => {
    const s = spec("keyset");
    expect(keysetColumns(s, parseListQuery({}, s))).toBe("(o.created_at)::text AS list_sort_key, (o.id)::text AS list_row_id");
  });

  it("reads one extra row on a keyset page and offsets an offset page", () => {
    const k: unknown[] = [];
    expect(pageClause(parseListQuery({ pageSize: "50" }, spec("keyset")), k)).toBe("LIMIT $1");
    expect(k).toEqual([51]);
    const o: unknown[] = ["a"];
    expect(pageClause(parseListQuery({ page: "3" }, spec("offset")), o)).toBe("LIMIT $2 OFFSET $3");
    expect(o).toEqual(["a", 25, 50]);
  });

  it("caps a count at 10 001 rows", () => {
    expect(cappedCountSql("SELECT 1 FROM t WHERE x")).toBe("SELECT count(*)::int AS n FROM (SELECT 1 FROM t WHERE x LIMIT 10001) capped");
  });

  it("takes the user's wildcards literally", () => {
    expect(likePattern("50%_off\\")).toBe("%50\\%\\_off\\\\%");
    expect(prefixPattern("30_")).toBe("30\\_%");
  });

  it("rejects cursors that are not the pair it made", () => {
    expect(decodeCursor(Buffer.from(JSON.stringify({ n: 1 })).toString("base64url"))).toBeNull();
    expect(decodeCursor(Buffer.from(JSON.stringify([1, ID])).toString("base64url"))).toBeNull();
  });
});

describe("pages", () => {
  const rows = (n: number, total: number) => Array.from({ length: n }, (_, i) => ({ id: i, full_count: String(total) }));

  it("returns the page asked for with its total", async () => {
    const req = parseListQuery({ page: "2" }, spec("offset"));
    const r = await runOffsetPage(req, async ({ limit, offset }) => {
      expect({ limit, offset }).toEqual({ limit: 25, offset: 25 });
      return rows(25, 60);
    });
    expect(r).toMatchObject({ total: 60, page: 2 });
    expect(offsetListPage(r.rows, req, r)).toMatchObject({ total: 60, page: 2, totalCapped: false, nextCursor: null, ignored: [] });
  });

  it("answers a page past the end with the last real page", async () => {
    const req = parseListQuery({ page: "9" }, spec("offset"));
    const calls: number[] = [];
    const r = await runOffsetPage(req, async ({ limit, offset }) => {
      calls.push(offset);
      if (offset === 200) return [];
      if (limit === 1) return rows(1, 60);
      return rows(10, 60);
    });
    expect(calls).toEqual([200, 0, 50]);
    expect(r).toMatchObject({ total: 60, page: 3 });
  });

  it("answers an empty list as page 1 of 0", async () => {
    const r = await runOffsetPage(parseListQuery({ page: "3" }, spec("offset")), async () => []);
    expect(r).toMatchObject({ total: 0, page: 1, rows: [] });
  });

  it("makes the next cursor from the last row shown and caps the count", () => {
    const req = parseListQuery({ pageSize: "25" }, spec("keyset"));
    const r = Array.from({ length: 26 }, (_, i) => ({ list_sort_key: `k${i}`, list_row_id: `id${i}` }));
    const page = keysetListPage(r, req, 10_001, (x) => x.list_row_id);
    expect(page.items).toHaveLength(25);
    expect(decodeCursor(page.nextCursor!)).toEqual({ value: "k24", id: "id24" });
    expect(page).toMatchObject({ total: 10_000, totalCapped: true, page: null });
    expect(keysetListPage(r.slice(0, 3), req, 3, (x) => x).nextCursor).toBeNull();
  });
});
