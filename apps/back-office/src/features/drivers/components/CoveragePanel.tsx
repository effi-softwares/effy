import { useQuery } from "@tanstack/react-query"

import { Link } from "@tanstack/react-router"

import type { CoverageGap } from "@effy/shared-types"

import { COVERAGE_REASON_LABEL, FUNCTION_SHORT } from "../capabilityModel"
import { coverageQuery } from "../capabilityQueries"

export function CoveragePanel() {
  const query = useQuery(coverageQuery())
  const gaps = query.data?.gaps ?? []

  if (query.isPending) return null

  if (gaps.length === 0) {
    return <p className="text-sm text-muted-foreground">Every zone can be served for every kind of work it offers.</p>
  }

  const byZone = new Map<string, CoverageGap[]>()
  for (const g of gaps) {
    const list = byZone.get(g.zoneName) ?? []
    list.push(g)
    byZone.set(g.zoneName, list)
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        {gaps.length} {gaps.length === 1 ? "gap" : "gaps"} across {byZone.size} {byZone.size === 1 ? "area" : "areas"}.
      </p>

      <ul className="divide-y border-y">
        {[...byZone.entries()].map(([zoneName, zoneGaps]) => (
          <li key={zoneName} className="space-y-1 py-3">
            <p className="text-sm font-medium">{zoneName}</p>
            {zoneGaps.map((g) => (
              <p key={g.function} className="text-sm text-muted-foreground">
                {FUNCTION_SHORT[g.function]} —{" "}
                <span className="text-foreground">{COVERAGE_REASON_LABEL[g.reason]}</span>
                {g.clearedDriverCount > 0 ? <span> ({g.clearedDriverCount} cleared, none available)</span> : null}
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
  )
}
