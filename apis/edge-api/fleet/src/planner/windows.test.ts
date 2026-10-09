import { describe, expect, it } from "vitest";

import type { PlannablePackage } from "./types";
import { deadlineFor, groupByWindow } from "./windows";

const at = (iso: string) => new Date(iso);
const EARLY = { windowStart: at("2026-10-08T06:00:00Z"), windowEnd: at("2026-10-08T08:00:00Z") }; // 5–7 pm AEDT
const LATE = { windowStart: at("2026-10-08T08:00:00Z"), windowEnd: at("2026-10-08T10:00:00Z") }; //  7–9 pm AEDT
const END_OF_DAY = at("2026-10-08T12:59:59Z");

function pkg(id: string, window: { windowStart: Date | null; windowEnd: Date | null }): PlannablePackage {
  return {
    packageId: id, orderNumber: `EFY-${id}`, shopId: "shop-1", shopName: "Shop", address: "1 Test St",
    orderId: `order-${id}`, recipientName: "Pat", deliveredBy: "effy", zoneId: "z", zoneName: "Zone",
    readySince: "2026-10-08T03:00:00Z", weightGrams: 1000, itemCount: 1,
    requiresChilled: false, requiresFrozen: false, ...window,
  };
}
const NONE = { windowStart: null, windowEnd: null };

describe("groupByWindow", () => {
  it("puts packages sold the same window together, earliest window first, the windowless last", () => {
    const groups = groupByWindow([pkg("a", LATE), pkg("b", NONE), pkg("c", EARLY), pkg("d", LATE)]);

    expect(groups.map((g) => g.packages.map((p) => p.packageId))).toEqual([["c"], ["a", "d"], ["b"]]);
    expect(groups[0]!.windowEnd).toEqual(EARLY.windowEnd);
    expect(groups[2]!.windowStart).toBeNull();
  });

  it("keeps readiness order inside a group — what waited longest is still placed first", () => {
    const groups = groupByWindow([pkg("first", EARLY), pkg("second", EARLY), pkg("third", EARLY)]);
    expect(groups[0]!.packages.map((p) => p.packageId)).toEqual(["first", "second", "third"]);
  });

  it("returns nothing for nothing", () => {
    expect(groupByWindow([])).toEqual([]);
  });
});

describe("deadlineFor", () => {
  const group = groupByWindow([pkg("a", EARLY)])[0]!;

  it("⚠ is the window's END while the window can still be met — not the end of the day", () => {
    expect(deadlineFor(group, at("2026-10-08T05:30:00Z"), END_OF_DAY)).toEqual(EARLY.windowEnd);
    expect(deadlineFor(group, at("2026-10-08T07:59:59Z"), END_OF_DAY)).toEqual(EARLY.windowEnd);
  });

  it("⚠ falls back to the end of the day once the window has passed, so a late package is still sent", () => {
    // A deadline in the past fails every driver's feasibility gate; the package would sit at the hub
    // being refused on every tick until midnight.
    expect(deadlineFor(group, at("2026-10-08T08:00:00Z"), END_OF_DAY)).toEqual(END_OF_DAY);
    expect(deadlineFor(group, at("2026-10-08T09:30:00Z"), END_OF_DAY)).toEqual(END_OF_DAY);
  });

  it("is the end of the day for a group with no window", () => {
    expect(deadlineFor(groupByWindow([pkg("a", NONE)])[0]!, at("2026-10-08T05:30:00Z"), END_OF_DAY)).toEqual(END_OF_DAY);
  });
});
