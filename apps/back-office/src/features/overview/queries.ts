import { queryOptions } from "@tanstack/react-query"

import type { CourierParcelListDTO, FleetOverviewDTO } from "@effy/shared-types"

import { api } from "@/lib/api"

/** Under `["dispatch"]` (a run or round changed) and listed for `orders` too (a shop readied a package). */
export const OVERVIEW_RUNS_KEY = ["dispatch", "overview"] as const
export const overviewRunsQuery = () =>
  queryOptions({
    queryKey: OVERVIEW_RUNS_KEY,
    queryFn: () => api.get<FleetOverviewDTO>("/fleet/v1/overview"),
  })

/** The Courier tab's stage counts: the first page is read, for its `views`. Under `["orders"]`. */
export const courierCountsQuery = () =>
  queryOptions({
    queryKey: ["orders", "courier", "counts"] as const,
    queryFn: ({ signal }) => api.get<CourierParcelListDTO>("/orders/v1/handovers", { signal }),
    select: (d) => d.views,
  })
