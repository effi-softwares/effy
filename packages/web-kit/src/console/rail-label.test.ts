import { describe, expect, it } from "vitest";

import {
  RAIL_LINE_PX,
  railLabelOf,
  railLabelProblems,
  railTextWidth,
} from "./rail-label";

describe("the folded rail's label", () => {
  it("measures with the font's own widths (Geist SemiBold 12px)", () => {
    expect(railTextWidth("Team")).toBeCloseTo(31.8, 0);
    expect(railTextWidth("Management")).toBeCloseTo(76.6, 0);
  });

  it("refuses a word wider than the line: the one that was cut as 'Managemen / t'", () => {
    expect(railTextWidth("Management")).toBeGreaterThan(RAIL_LINE_PX);
    expect(railLabelProblems("Management")).toEqual([
      '"Management" is wider than the rail',
    ]);
  });

  it("lets two words take two lines, and refuses a third", () => {
    expect(railLabelProblems("Hub station")).toEqual([]);
    expect(railLabelProblems("Categories & attributes")).toEqual([]);
    expect(railLabelProblems("Hand over report today")).toEqual([
      '"Hand over report today" needs 3 lines (the rail shows two)',
    ]);
  });

  it("measures an unknown character as the widest letter, so it errs towards too wide", () => {
    expect(railTextWidth("é")).toBe(railTextWidth("M"));
  });

  it("shows the shorter rail name when an entry has one", () => {
    expect(
      railLabelOf({
        label: "Categories & attributes",
        railLabel: "Categories",
      }),
    ).toBe("Categories");
    expect(railLabelOf({ label: "Orders" })).toBe("Orders");
  });
});
