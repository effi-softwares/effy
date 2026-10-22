import { describe, expect, it } from "vitest";

import { planRow, planTable } from "./stockPlan";

const counted = (onHand: number) => ({ tracked: true, onHand });
const uncounted = { tracked: false, onHand: null };

describe("stock table (098)", () => {
  it("receive ADDS to the shelf; count REPLACES it", () => {
    expect(planRow(counted(5), "24", "receive")).toEqual({ kind: "adjust", delta: 24, after: 29 });
    expect(planRow(counted(5), "3", "count")).toEqual({ kind: "set", onHand: 3, after: 3 });
  });

  it("an uncounted size starts counting at the number, in either mode", () => {
    expect(planRow(uncounted, "24", "receive")).toEqual({ kind: "start", onHand: 24, after: 24 });
    expect(planRow(uncounted, "0", "count")).toEqual({ kind: "start", onHand: 0, after: 0 });
    expect(planRow(uncounted, "0", "receive")).toEqual({ kind: "none" });
  });

  it("writes nothing for a blank, a zero received, or a count that is already right", () => {
    expect(planRow(counted(5), "", "receive")).toEqual({ kind: "none" });
    expect(planRow(counted(5), "0", "receive")).toEqual({ kind: "none" });
    expect(planRow(counted(5), "5", "count")).toEqual({ kind: "none" });
  });

  it("refuses anything but a whole number", () => {
    for (const bad of ["-2", "1.5", "ten", "1e3"]) expect(planRow(counted(5), bad, "receive").kind).toBe("invalid");
  });

  it("plans only the rows that change, and counts the invalid ones", () => {
    const rows = [
      { id: "a", stock: counted(5) },
      { id: "b", stock: counted(0) },
      { id: "c", stock: uncounted },
      { id: "d", stock: counted(1) },
    ];
    const out = planTable(rows, { a: "10", b: "", c: "4", d: "x" }, "receive");
    expect(out.writes.map((w) => [w.row.id, w.plan.kind])).toEqual([["a", "adjust"], ["c", "start"]]);
    expect(out.invalid).toBe(1);
  });
});
