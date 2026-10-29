import { describe, expect, it } from "vitest";

import { ACTIVITY_EXPORT_CAP } from "@effy/shared-types";

import {
  actionFallback,
  actionsMatching,
  csvCell,
  csvLine,
  csvWhen,
  parseActivityQuery,
  toActivityEntry,
  type ActivitySource,
} from "./activity";

describe("activity logs (104)", () => {
  it("parses 103's parameters, the log's kinds and the export flag", () => {
    const req = parseActivityQuery(
      {
        q: " refund ",
        kind: "refund",
        from: "2026-10-01",
        to: "2026-10-31",
        export: "csv",
        dir: "asc",
      },
      "bo-order",
    );
    expect(req.q).toBe("refund");
    expect(req.filters).toEqual({
      kind: "refund",
      from: "2026-10-01",
      to: "2026-10-31",
    });
    expect(req.export).toBe(true);
    expect(req.dir).toBe("asc");
    expect(req.mode).toBe("keyset");
  });

  it("drops a kind another log has, and says it was ignored", () => {
    const req = parseActivityQuery({ kind: "stock" }, "bo-order");
    expect(req.filters.kind).toBeUndefined();
    expect(req.ignored).toEqual(["kind"]);
    expect(req.export).toBe(false);
  });

  it("finds actions by the words the server says, case-insensitively", () => {
    const words = {
      "driver.status_changed": "Employment status changed",
      "driver.created": "Added to the platform",
    };
    expect(actionsMatching(words, "STATUS")).toEqual(["driver.status_changed"]);
    expect(actionsMatching(words, "nothing")).toEqual([]);
  });

  it("writes the time in the business's time zone", () => {
    // 2026-10-29T03:03Z is 14:03 in Melbourne (daylight time, +11).
    expect(csvWhen(new Date("2026-10-29T03:03:00Z"))).toBe("2026-10-29 14:03");
  });

  it("quotes cells that need it and defuses formulas", () => {
    expect(csvCell("plain")).toBe("plain");
    expect(csvCell('a "b", c')).toBe('"a ""b"", c"');
    expect(csvCell("line\nbreak")).toBe('"line\nbreak"');
    expect(csvCell("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)");
    expect(csvCell("-3")).toBe("'-3");
    expect(csvLine(["a", "b,c"])).toBe('a,"b,c"');
  });

  it("names an action nobody worded", () => {
    expect(actionFallback("shop.pack_scanning_changed")).toBe("Pack scanning changed");
  });

  it("takes the row's actor unless the words decide it", () => {
    const source: ActivitySource = {
      sql: "",
      args: [],
      actionWords: {},
      entry: (r) => (r.action === "x" ? { title: "X", actor: "Effy" } : { title: "Y" }),
    };
    const row = {
      id: "1",
      at: new Date("2026-10-29T00:00:00Z"),
      kind: "k",
      action: "x",
      actor: "Sam",
      search_text: null,
      facts: null,
    };
    expect(toActivityEntry(source, row)).toMatchObject({
      title: "X",
      actor: "Effy",
      tone: "default",
      detail: null,
      subject: null,
    });
    expect(toActivityEntry(source, { ...row, action: "y" }).actor).toBe("Sam");
  });

  it("caps an export at ten thousand", () => {
    expect(ACTIVITY_EXPORT_CAP).toBe(10_000);
  });
});
