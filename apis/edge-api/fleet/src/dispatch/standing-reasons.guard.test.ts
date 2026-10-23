import { describe, expect, it } from "vitest";

import { UNASSIGNED_WORK } from "./sql";

/** A package's reasons must be joined by `kind`, or a hub package shows the reasons it had at the shop. */
describe("UNASSIGNED_WORK joins standing reasons by stage", () => {
  /** Line comments stripped, so prose cannot satisfy an assertion. */
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

  it("lists hub-side packages by the delivery gather's own conditions", () => {
    expect(hubSide).toMatch(/rp\.state\s*=\s*'picked_up'/);
    // Effy delivers it (the order's type, never the method), and its day has come.
    expect(hubSide).toMatch(/o\.delivery_type\s*=\s*'effy'/);
    expect(hubSide).toMatch(/opd\.window_start IS NULL OR opd\.window_start <= \$1::timestamptz/);
    expect(hubSide).not.toMatch(/delivery_method\s*=\s*'same_day'/);
    expect(hubSide).toMatch(/sf\.status\s*=\s*'collected'/);
  });
});
