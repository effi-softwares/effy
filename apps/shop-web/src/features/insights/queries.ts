import { keepPreviousData, queryOptions } from "@tanstack/react-query"

import type { InsightsRange } from "@effy/shared-types"

import { getInsights } from "./repo"

export const insightsQuery = (range: InsightsRange) =>
  queryOptions({
    queryKey: ["shop", "insights", range] as const,
    queryFn: () => getInsights(range),
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  })
