import { describe, expect, it } from "vitest";

import { UNASSIGNED_WORK } from "./sql";

/**
 * ⚠ THE DEFECT THIS PINS WAS LIVE AND COMPLETELY SILENT.
 *
 * `UNASSIGNED_WORK` lists packages that are `ready_for_pickup` — collection work — and resolves each
 * one's refusal reasons through `assignment_exclusion`, which is keyed by `wave_id`. The CTE that
 * picks the wave was written as "the most recent wave", unqualified.
 *
 * The planner writes a DELIVERY wave on every single tick, roughly 30ms after the collection wave it
 * writes only when a run is due. So "the most recent wave" is almost always the delivery one, the
 * LEFT JOIN matched nothing, and every row in the dispatcher's Needs-attention panel rendered with an
 * empty reason list — while the reasons sat in the database, correct, against a different wave id.
 *
 * Nothing failed. The query is valid SQL, the panel renders, the rows are right; only the
 * explanation is missing, and a missing explanation looks exactly like "no reason was recorded".
 * That is the shape FR-015 and SC-003 exist to prevent, so it gets a guard rather than a fix alone.
 */
describe("UNASSIGNED_WORK resolves reasons against the COLLECTION wave", () => {
  /** The CTE body, with SQL line comments stripped so prose cannot satisfy the assertions. */
  const cte = (() => {
    const body = UNASSIGNED_WORK.slice(
      UNASSIGNED_WORK.indexOf("WITH latest AS"),
      UNASSIGNED_WORK.indexOf("SELECT sf.id"),
    );
    return body
      .split("\n")
      .map((l) => l.replace(/--.*$/, ""))
      .join("\n");
  })();

  it("filters dispatch_wave by kind", () => {
    expect(cte).toMatch(/kind\s*=\s*'collection'/);
  });

  it("still takes only the most recent one", () => {
    expect(cte).toMatch(/ORDER BY\s+started_at\s+DESC/i);
    expect(cte).toMatch(/LIMIT\s+1/i);
  });

  it("does not select a wave without qualifying its kind", () => {
    // The whole defect in one assertion: a FROM dispatch_wave with no kind predicate before the
    // ORDER BY is the unscoped form that shipped.
    const unscoped = /FROM\s+public\.dispatch_wave\s+ORDER\s+BY/i;
    expect(cte).not.toMatch(unscoped);
  });

  it("joins exclusions on that wave, so a stale wave cannot leak reasons", () => {
    expect(UNASSIGNED_WORK).toMatch(/ae\.wave_id\s*=\s*\(SELECT id FROM latest\)/);
  });
});
