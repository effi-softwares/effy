import { describe, expect, it } from "vitest";

import { addSummaries, manifestsByPackage, summarize, toTemperatureClass, type ManifestRow } from "./manifest";

const row = (over: Partial<ManifestRow>): ManifestRow => ({
  package_id: "p1",
  name: "Item",
  ordered_qty: 1,
  storage_class: "ambient",
  gathered_qty: null,
  ...over,
});

describe("065 — temperature class", () => {
  it("maps the catalogue's words to the driver's", () => {
    expect(toTemperatureClass("frozen")).toBe("frozen");
    expect(toTemperatureClass("chilled")).toBe("chilled");
    expect(toTemperatureClass("ambient")).toBe("normal");
  });

  /** ⚠ SC-008. A line sold before 065 must never be presented as Normal. */
  it("⚠ NULL is not_recorded, never normal", () => {
    expect(toTemperatureClass(null)).toBe("not_recorded");
  });

  it("an unrecognised stored value asserts no class", () => {
    expect(toTemperatureClass("room_temperature")).toBe("not_recorded");
    expect(toTemperatureClass("")).toBe("not_recorded");
  });
});

describe("065 — what is in the bag (research R3)", () => {
  const one = (r: Partial<ManifestRow>) => manifestsByPackage(["p1"], [row(r)]).get("p1")!.items[0]!;

  it("no pick row → the ordered quantity, included", () => {
    expect(one({ ordered_qty: 3, gathered_qty: null })).toMatchObject({ qty: 3, orderedQty: 3, included: true });
  });

  it("part-supplied → the gathered quantity", () => {
    expect(one({ ordered_qty: 5, gathered_qty: 2 })).toMatchObject({ qty: 2, orderedQty: 5, included: true });
  });

  it("a pick row with nothing gathered → not included", () => {
    expect(one({ ordered_qty: 2, gathered_qty: 0 })).toMatchObject({ qty: 0, orderedQty: 2, included: false });
  });

  it("reads numeric strings, as the driver returns bigint and numeric columns", () => {
    expect(one({ ordered_qty: "4", gathered_qty: "4" })).toMatchObject({ qty: 4, orderedQty: 4 });
  });
});

describe("065 — per-package grouping and ordering", () => {
  it("⚠ each package gets its OWN lines (research R2)", () => {
    const m = manifestsByPackage(
      ["p1", "p2"],
      [
        row({ package_id: "p1", name: "A", ordered_qty: 2 }),
        row({ package_id: "p2", name: "B", ordered_qty: 5 }),
      ],
    );
    expect(m.get("p1")!.items.map((i) => i.name)).toEqual(["A"]);
    expect(m.get("p2")!.items.map((i) => i.name)).toEqual(["B"]);
    expect(m.get("p1")!.summary.normal).toBe(2);
    expect(m.get("p2")!.summary.normal).toBe(5);
  });

  it("a package with no rows has an empty manifest, not a missing one", () => {
    const m = manifestsByPackage(["p1"], []);
    expect(m.get("p1")).toEqual({ items: [], summary: { frozen: 0, chilled: 0, normal: 0, notRecorded: 0 } });
  });

  it("orders frozen, chilled, normal, not recorded; in the bag before not; then by name", () => {
    const items = manifestsByPackage(
      ["p1"],
      [
        row({ name: "Rice", storage_class: "ambient" }),
        row({ name: "Old tin", storage_class: null }),
        row({ name: "Milk", storage_class: "chilled" }),
        row({ name: "Peas", storage_class: "frozen" }),
        row({ name: "Ice cream", storage_class: "frozen", gathered_qty: 0 }),
        row({ name: "Chips", storage_class: "frozen" }),
      ],
    ).get("p1")!.items;
    expect(items.map((i) => i.name)).toEqual(["Chips", "Peas", "Ice cream", "Milk", "Rice", "Old tin"]);
  });
});

describe("065 — class summary", () => {
  it("counts UNITS in the bag per class", () => {
    const { items } = manifestsByPackage(
      ["p1"],
      [
        row({ name: "Peas", storage_class: "frozen", ordered_qty: 2 }),
        row({ name: "Milk", storage_class: "chilled", ordered_qty: 3, gathered_qty: 1 }),
        row({ name: "Rice", storage_class: "ambient", ordered_qty: 6 }),
        row({ name: "Old tin", storage_class: null, ordered_qty: 1 }),
      ],
    ).get("p1")!;
    expect(summarize(items)).toEqual({ frozen: 2, chilled: 1, normal: 6, notRecorded: 1 });
  });

  /** FR-016 — a line the shop did not supply is in no bucket. */
  it("⚠ excludes lines that are not included", () => {
    const { summary } = manifestsByPackage(
      ["p1"],
      [row({ storage_class: "frozen", ordered_qty: 4, gathered_qty: 0 })],
    ).get("p1")!;
    expect(summary).toEqual({ frozen: 0, chilled: 0, normal: 0, notRecorded: 0 });
  });

  it("a drop's summary is the sum of its packages'", () => {
    expect(
      addSummaries([
        { frozen: 1, chilled: 0, normal: 2, notRecorded: 0 },
        { frozen: 0, chilled: 3, normal: 1, notRecorded: 1 },
      ]),
    ).toEqual({ frozen: 1, chilled: 3, normal: 3, notRecorded: 1 });
  });
});
