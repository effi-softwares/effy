import { describe, expect, it } from "vitest";
import type { InsightsBucketDTO, InsightsFigureDTO, InsightsTopProductDTO } from "@effy/shared-types";

import { buildBriefing, moodOf } from "./briefing";

const pct = (amount: string | null): InsightsFigureDTO => ({ value: "100.00", previous: "90.00", change: amount === null ? { kind: "none", amount } : { kind: "pct", amount } });
const bucket = (label: string, revenue: string): InsightsBucketDTO => ({ start: "", label, partial: false, revenue, orders: 1, units: 3, previousRevenue: null, previousOrders: null, previousUnits: null, foundRate: null, cantSupplyRate: null, averageTimeToReady: null });
const product = (name: string, previousRank: number | null): InsightsTopProductDTO => ({ productId: name, name, sku: null, thumbnailUrl: null, units: 10, revenue: "10.00", share: 1, shareOfSales: "10.0", previousRank, stockLeft: null });
const found = (value: string, previous: string, amount: string): InsightsFigureDTO => ({ value, previous, change: { kind: "abs", amount } });
const base = {
  range: "7d" as const, weekday: "Monday", currency: "AUD", revenue: pct("12"), buckets: [] as InsightsBucketDTO[],
  quality: { foundRate: null, cantSupplyRate: null, averageTimeToReady: null, readyBeforeDriver: null as InsightsFigureDTO | null, readySpread: [0, 0, 0, 0, 0, 0] },
  topProducts: [] as InsightsTopProductDTO[], cantSupplyProducts: [] as { name: string; units: number }[],
};

describe("the mood", () => {
  it.each([["8", "strong"], ["7.9", "steady"], ["0", "steady"], ["-3", "slower"], ["-8", "quiet"]])("%s%% reads %s", (amount, mood) => {
    expect(moodOf(pct(amount))).toBe(mood);
  });

  it("says nothing with nothing to compare against", () => {
    expect(moodOf(pct(null))).toBeNull();
  });
});

describe("what changed", () => {
  it("names the best day and its share, spelling the weekday out on a week", () => {
    const { changes } = buildBriefing({ ...base, buckets: [bucket("Mon 8", "100"), bucket("Fri 12", "300")] });
    expect(changes[0]).toEqual({ tone: "up", title: "Friday was the best day", detail: "$300, 75% of this week", page: "sales" });
  });

  it("says the busiest hour on a day, in shop words", () => {
    const { changes } = buildBriefing({ ...base, range: "today", buckets: [bucket("09", "10"), bucket("13", "40")] });
    expect(changes[0]!.title).toBe("1 pm was the busiest hour");
  });

  it("does not pick a best out of one", () => {
    expect(buildBriefing({ ...base, buckets: [bucket("Mon 8", "100"), bucket("Tue 9", "0")] }).changes).toEqual([]);
  });

  it("says why the found rate fell, when it can", () => {
    const line = buildBriefing({
      ...base,
      quality: { ...base.quality, foundRate: found("95.4", "97.1", "-1.7") },
      cantSupplyProducts: [{ name: "Rice", units: 6 }, { name: "Eggs", units: 5 }],
    }).changes[0]!;
    expect(line).toMatchObject({ tone: "down", title: "Found rate fell to 95.4%", detail: "Rice caused 6 of the 11 units you could not supply", page: "service" });
  });

  it("ignores a rate that barely moved", () => {
    expect(buildBriefing({ ...base, quality: { ...base.quality, foundRate: found("97.1", "97.1", "0.0") } }).changes).toEqual([]);
  });

  it("picks the biggest climber, else the best seller", () => {
    const climb = buildBriefing({ ...base, topProducts: [product("A", 1), product("B", null), product("C", 7)] }).changes[0]!;
    expect(climb).toMatchObject({ title: "C is climbing", detail: "Up 4 places to number 3 in your best sellers" });
    const flat = buildBriefing({ ...base, topProducts: [product("A", 1), product("B", 3)] }).changes[0]!;
    expect(flat).toMatchObject({ tone: "flat", title: "A is your best seller" });
  });

  it("compares in the range's own words", () => {
    expect(buildBriefing(base).comparedWith).toBe("the week before");
    expect(buildBriefing({ ...base, range: "30d" }).comparedWith).toBe("the 30 days before");
    expect(buildBriefing({ ...base, range: "today" }).comparedWith).toBe("last Monday at this time");
  });
});

describe("the new lines (Insights redesign 2)", () => {
  it("says what selling out cost, and opens Stock", () => {
    const { changes } = buildBriefing({ ...base, soldOut: { name: "Sourdough loaf", times: 3, missedRevenue: "160.00" } });
    expect(changes).toContainEqual({ tone: "down", title: "Sourdough loaf sold out 3 times", detail: "About $160 of sales it could have had", page: "stock" });
  });

  it("stays quiet about a sell-out that cost little", () => {
    const { changes } = buildBriefing({ ...base, soldOut: { name: "Tahini", times: 1, missedRevenue: "8.00" } });
    expect(changes.some((c) => c.page === "stock")).toBe(false);
  });

  it("names the driver missed most when the ready rate moved", () => {
    const { changes } = buildBriefing({
      ...base,
      quality: { ...base.quality, readyBeforeDriver: found("93.2", "88.0", "5.2") },
      worstRun: { time: "12:30", due: 61, ready: 52 },
    });
    expect(changes).toContainEqual({
      tone: "up",
      title: "93% ready before the driver",
      detail: "From 88% the week before. The 12:30 pm driver is the one you miss most.",
      page: "service",
    });
  });
});
