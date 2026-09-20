import { useQuery } from "@tanstack/react-query";

import { Link } from "@tanstack/react-router";

import type { CoverageGap } from "@effy/shared-types";

import { COVERAGE_REASON_LABEL, FUNCTION_SHORT, METHOD_LABEL } from "../capabilityModel";
import { coverageQuery } from "../capabilityQueries";

/**
 * Where the fleet has no cover (062 US4).
 *
 * ⚠ A LIST OF PROBLEMS, NOT A MATRIX. A covered combination emits no row at all (FR-019) — a screen
 * that lists every zone and colours the bad ones is a screen an operator has to scan, and the whole
 * point of this view is that it is short enough to read.
 *
 * ⚠ AND IT LIVES INSIDE THE READINESS SECTION, NOT ON ITS OWN PAGE (FR-020). Two screens answering
 * "can this driver work?" would eventually disagree, and an operator would have no way to tell which
 * was right. Both read one availability rule on the server for the same reason.
 */
export function CoveragePanel() {
  const query = useQuery(coverageQuery());
  const gaps = query.data?.gaps ?? [];

  if (query.isPending) return null;

  if (gaps.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Every zone can be served for every kind of work it offers.
      </p>
    );
  }

  // Grouped by zone so an operator reads one place at a time rather than one row at a time.
  const byZone = new Map<string, CoverageGap[]>();
  for (const g of gaps) {
    const list = byZone.get(g.zoneName) ?? [];
    list.push(g);
    byZone.set(g.zoneName, list);
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        {gaps.length} {gaps.length === 1 ? "gap" : "gaps"} across {byZone.size}{" "}
        {byZone.size === 1 ? "zone" : "zones"}. A zone appears here only for work it actually offers.
      </p>

      <ul className="divide-y border-y">
        {[...byZone.entries()].map(([zoneName, zoneGaps]) => (
          <li key={zoneName} className="space-y-1 py-3">
            <p className="text-sm font-medium">{zoneName}</p>
            {zoneGaps.map((g) => (
              <p key={`${g.function}-${g.method}`} className="text-sm text-muted-foreground">
                {FUNCTION_SHORT[g.function]} · {METHOD_LABEL[g.method]} —{" "}
                <span className="text-foreground">{COVERAGE_REASON_LABEL[g.reason]}</span>
                {/* ⚠ The count is what makes the two reasons ACTIONABLE. Zero means grant somebody a
                    clearance, here. More than zero means the people who have it cannot work today,
                    and the fix is above, in readiness. */}
                {g.clearedDriverCount > 0 ? (
                  <span> ({g.clearedDriverCount} cleared, none available)</span>
                ) : null}
              </p>
            ))}
          </li>
        ))}
      </ul>

      <p className="text-sm text-muted-foreground">
        Grant a clearance on any{" "}
        <Link to="/drivers" className="text-primary hover:underline">
          driver's record
        </Link>
        .
      </p>
    </div>
  );
}
