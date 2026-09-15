import { keepPreviousData, queryOptions } from "@tanstack/react-query"

import type { InsightsRange } from "@effy/shared-types"

import { getInsights } from "./repo"

/**
 * One cache entry per range (058).
 *
 * ⚠ NOT POLLED. These figures move at the pace of the rollup job — a minute — and an analytics screen
 * that refetches on a timer would spend the platform's money re-reading numbers nobody is watching
 * change. The subtitle says when they were computed, which is the honest alternative to pretending
 * they are live (Shopify does the same; see docs/insights-architecture.md §1.1).
 *
 * `keepPreviousData` so switching ranges swaps the figures without collapsing the page to skeletons —
 * the layout stays still and only the numbers change.
 */
export const insightsQuery = (range: InsightsRange) =>
  queryOptions({
    queryKey: ["shop", "insights", range] as const,
    queryFn: () => getInsights(range),
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  })
