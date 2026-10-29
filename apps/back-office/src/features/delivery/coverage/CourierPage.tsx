import { useQuery } from "@tanstack/react-query"

import { ErrorState } from "@effy/web-kit/console"

import { PageHeader } from "@effy/web-kit/patterns"
import { coverageQuery } from "../queries"
import { CourierPanel, CourierPanelSkeleton } from "./CourierPanel"

export function CourierPage({ canManage }: { canManage: boolean }) {
  const coverage = useQuery(coverageQuery())
  const first = coverage.data
  return (
    <>
      <PageHeader
        title="Courier delivery"
        description="Courier delivery for addresses outside Effy's area, its fees, and the courier services used."
      />
      {coverage.isError ? (
        <ErrorState error={coverage.error} onRetry={() => void coverage.refetch()} />
      ) : !first ? (
        <div className="settings">
          <CourierPanelSkeleton />
        </div>
      ) : (
        <div className="settings">
          <CourierPanel courier={first.courier} canManage={canManage} />
        </div>
      )}
    </>
  )
}
