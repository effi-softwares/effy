import { describe, expect, it } from "vitest";

import { UNASSIGNED_WORK } from "./sql";

/**
 * ⚠ A PACKAGE'S REASONS MUST BE JOINED BY `kind` (072).
 *
 * `assignment_exclusion` holds one standing set of reasons per package PER STAGE: why nobody can
 * collect it, and — hours later, once it is at the hub — why nobody can deliver it. A join on the
 * package alone would show a hub-side package the reasons it had at the shop, and nothing would
 * fail: the panel would render a plausible explanation that describes a different problem.
 *
 * This replaces `unassigned-wave-scope.guard.test.ts`, which held the same class of defect one
 * design earlier — reasons resolved against "the latest wave" without saying which kind of wave,
 * found live as 14 packages listed with no explanation.
 */
describe("UNASSIGNED_WORK joins standing reasons by stage", () => {
  /** SQL with line comments stripped, so prose cannot satisfy an assertion. */
  const sql = UNASSIGNED_WORK.split("\n")
    .map((l) => l.replace(/--.*$/, ""))
    .join("\n");
  const [shopSide, hubSide] = sql.split(/UNION ALL/i) as [string, string];

  it("has a shop-side half and a hub-side half", () => {
    expect(shopSide).toMatch(/'collection'::text\s+AS stage/);
    expect(hubSide).toMatch(/'delivery'::text\s+AS stage/);
  });

  it("joins the shop-side half on kind = 'collection'", () => {
    expect(shopSide).toMatch(/ae\.shop_fulfillment_id\s*=\s*sf\.id\s+AND\s+ae\.kind\s*=\s*'collection'/);
  });

  it("joins the hub-side half on kind = 'delivery'", () => {
    expect(hubSide).toMatch(/ae\.shop_fulfillment_id\s*=\s*sf\.id\s+AND\s+ae\.kind\s*=\s*'delivery'/);
  });

  it("never joins exclusions without naming a kind", () => {
    const joins = sql.match(/JOIN public\.assignment_exclusion[\s\S]*?(?=WHERE)/g) ?? [];
    expect(joins).toHaveLength(2);
    for (const j of joins) expect(j).toMatch(/ae\.kind\s*=/);
  });

  it("no longer resolves a wave at all", () => {
    expect(sql).not.toMatch(/dispatch_wave/);
    expect(sql).not.toMatch(/wave_id/);
  });

  // The hub-side half must list exactly what the delivery gather would plan.
  it("lists hub-side packages by the delivery gather's own conditions", () => {
    expect(hubSide).toMatch(/rp\.state\s*=\s*'picked_up'/);
    // 082 — Effy delivers it (079's one definition, never the method), and its day has come.
    expect(hubSide).toMatch(/package_delivered_by\([\s\S]*?opd\.slot_id\)\s*=\s*'effy'/);
    expect(hubSide).toMatch(/opd\.window_start IS NULL OR opd\.window_start <= \$1::timestamptz/);
    expect(hubSide).not.toMatch(/delivery_method\s*=\s*'same_day'/);
    expect(hubSide).toMatch(/sf\.status\s*=\s*'collected'/);
  });
});
