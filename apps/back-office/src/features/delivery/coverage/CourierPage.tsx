import { useInfiniteQuery } from "@tanstack/react-query"
import { Skeleton } from "@effy/design-system/ui"
import { ErrorState } from "@effy/web-kit/console"

import { PageHeader } from "@effy/web-kit/patterns"
import { coverageQuery } from "../queries"
import { CourierPanel } from "./CourierPanel"

export function CourierPage({ canManage }: { canManage: boolean }) {
  const coverage = useInfiniteQuery(coverageQuery({}))
  const first = coverage.data?.pages[0]
  return (
    <>
      <PageHeader
        title="Courier delivery"
        description="Courier delivery for addresses outside Effy's area, its fees, and the courier services used."
      />
      {coverage.isError ? (
        <ErrorState error={coverage.error} onRetry={() => void coverage.refetch()} />
      ) : !first ? (
        <Skeleton className="h-60" aria-busy="true" />
      ) : (
        <div className="bo-settings">
          <CourierPanel courier={first.courier} canManage={canManage} />
        </div>
      )}
    </>
  )
}
