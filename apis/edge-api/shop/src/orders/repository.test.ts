import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it, vi } from "vitest";

const query = vi.hoisted(() => vi.fn());
const withTransaction = vi.hoisted(() => vi.fn());
vi.mock("@effy/edge-shared", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@effy/edge-shared")>()),
  query,
  withTransaction,
  presignRead: async (key: string) => `https://signed.example/${key}`,
}));

import { __test, actorLabel, addNote, listOrders, readActivity, replaceTags } from "./repository";
import { parseListQuery } from "./service";

const sql = (call: unknown[] | undefined): string => String(call?.[0] ?? "").replace(/\s+/g, " ");

afterEach(() => {
  query.mockReset();
  withTransaction.mockReset();
});

describe("shop scoping — every read is bound to the caller-resolved shop", () => {
  it("binds the list AND the counts to $1 = the shop", async () => {
    query.mockResolvedValue({ rows: [] });
    await listOrders("shop-1", parseListQuery(null));
    expect(query).toHaveBeenCalledTimes(2);
    for (const call of query.mock.calls) {
      expect(sql(call)).toContain("WHERE sf.shop_id = $1");
      expect((call[1] as unknown[])[0]).toBe("shop-1");
    }
  });

  it("refuses the activity of a portion that is not this shop's without reading it", async () => {
    query.mockResolvedValueOnce({ rows: [] });
    expect(await readActivity("f-x", "shop-1")).toBeNull();
    expect(query).toHaveBeenCalledTimes(1);
    expect(sql(query.mock.calls[0])).toContain("shop_id = $2");
  });
});

describe("the sort column is never the client's string", () => {
  it("maps each sort key to a fixed expression and ends with the id tiebreaker", async () => {
    query.mockResolvedValue({ rows: [] });
    await listOrders("shop-1", { ...parseListQuery(null), sort: "customer", dir: "desc" });
    expect(sql(query.mock.calls[0])).toContain("ORDER BY lower(customer_name) DESC, id DESC");
  });
});

describe("counts cover every state, under every filter except the tab", () => {
  it("sums per-tab counts into `all` and folds pending+received into `new`", async () => {
    query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [
          { tab: "new", n: "3" },
          { tab: "picking", n: "2" },
          { tab: "delivered", n: "7" },
        ],
      });
    const out = await listOrders("shop-1", { ...parseListQuery(null), tab: "picking" });
    expect(out.counts).toMatchObject({ all: 12, new: 3, picking: 2, delivered: 7, withdrawn: 0 });
    // The counts query takes the filters but NOT the tab.
    expect(query.mock.calls[1]![1]).toHaveLength(6);
    expect(sql(query.mock.calls[1])).not.toContain("$7");
  });

  it("falls back to the tab's count past the last page instead of claiming zero matches", async () => {
    query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ tab: "picking", n: "4" }] });
    const out = await listOrders("shop-1", { ...parseListQuery(null), tab: "picking", page: 9 });
    expect(out.total).toBe(4);
  });
});

describe("search", () => {
  it("escapes LIKE wildcards so a search means the characters typed", () => {
    expect(__test.likePattern("50%_off\\")).toBe("%50\\%\\_off\\\\%");
    expect(__test.likePattern("   ")).toBeNull();
  });
});

describe("money is integer cents, never floats", () => {
  it("normalises pg numerics to two decimals", () => {
    expect(__test.money("12.3")).toBe("12.30");
    expect(__test.money("0")).toBe("0.00");
    expect(__test.money(null)).toBe("0.00");
    // 0.1 + 0.2 is the classic float trap; cents arithmetic lands exactly.
    expect(__test.fromCents(__test.cents("0.10") + __test.cents("0.20"))).toBe("0.30");
  });
});

describe("who issued a refund, as a shop sees it", () => {
  it("names shop staff, and says Effy for back-office — never an employee's name", () => {
    expect(actorLabel("shop", "Maya")).toBe("Maya");
    expect(actorLabel("back_office", null)).toBe("Effy");
    expect(actorLabel("customer", null)).toBe("Customer");
    expect(actorLabel("system", null)).toBe("Payment provider");
  });
});

/** A withTransaction that runs the callback against a recording fake client. */
function fakeTx(rowsByCall: Array<{ rowCount?: number; rows?: unknown[] }>) {
  const calls: Array<[string, unknown[]]> = [];
  let i = 0;
  withTransaction.mockImplementation(async (fn: (c: unknown) => Promise<unknown>) =>
    fn({
      query: async (text: string, values: unknown[]) => {
        calls.push([text.replace(/\s+/g, " "), values]);
        return rowsByCall[i++] ?? { rowCount: 1, rows: [] };
      },
    }),
  );
  return calls;
}

describe("tags are written with their log entry, in one transaction", () => {
  it("writes nothing — not even a log entry — when the set is unchanged", async () => {
    const calls = fakeTx([{ rows: [{ id: "f-1" }] }, { rows: [{ tag: "fragile" }, { tag: "vip" }] }]);
    expect(await replaceTags("f-1", "shop-1", ["vip", "fragile"], "staff-1")).toBe(false);
    expect(calls).toHaveLength(2);
  });

  it("replaces the set and records the resulting tags", async () => {
    const calls = fakeTx([{ rows: [{ id: "f-1" }] }, { rows: [{ tag: "old" }] }]);
    expect(await replaceTags("f-1", "shop-1", ["vip", "fragile"], "staff-1")).toBe(true);
    const event = calls.find(([text]) => text.includes("INSERT INTO public.fulfillment_event"));
    expect(event?.[1]).toEqual(["f-1", "staff-1", "tags_changed", null, null, null, null, "fragile, vip"]);
  });

  it("locks the portion and scopes it to the shop before touching tags", async () => {
    const calls = fakeTx([{ rows: [] }]);
    expect(await replaceTags("f-x", "shop-1", ["a"], "staff-1")).toBeNull();
    expect(calls[0]![0]).toContain("shop_id = $2 FOR UPDATE");
    expect(calls).toHaveLength(1);
  });
});

describe("notes are written with their log entry", () => {
  it("records note_added without the body", async () => {
    const calls = fakeTx([{ rows: [{ id: "n-1" }] }]);
    expect(await addNote("f-1", "shop-1", "call first", "staff-1")).toBe("n-1");
    const event = calls.find(([text]) => text.includes("INSERT INTO public.fulfillment_event"));
    expect(event?.[1]).toEqual(["f-1", "staff-1", "note_added", null, null, null, null, null]);
  });

  it("writes nothing for another shop's portion", async () => {
    const calls = fakeTx([{ rows: [] }]);
    expect(await addNote("f-x", "shop-1", "hi", "staff-1")).toBeNull();
    expect(calls).toHaveLength(1);
  });
});

/**
 * ⚠ A3 lets the console show the order's money. It does NOT make capture or tax real: Effy captures at
 * payment (055 R3) and per-item GST is unmodelled (052 R13). If either ever appears in this module it
 * is inventing something, so the source is read and the test fails naming the file.
 */
describe("the console invents no money it cannot account for", () => {
  const here = dirname(fileURLToPath(import.meta.url));
  for (const file of ["repository.ts", "service.ts", "handler-support.ts", "types.ts"]) {
    it(`${file} names no capture step and no tax figure`, () => {
      const code = readFileSync(join(here, file), "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^\s*\/\/.*$/gm, "");
      expect(code).not.toMatch(/\bcapture(d|_amount|able)?\b/i);
      expect(code).not.toMatch(/\b(gst|vat|tax)(_amount|Amount)?\b/i);
    });
  }
});
