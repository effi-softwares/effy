import { createRoute, useSearch } from "@tanstack/react-router"

import { INSIGHTS_RANGES, type InsightsRange } from "@effy/shared-types"

import { InsightsScreen, type InsightsTab } from "@/features/insights/InsightsScreen"

import { appRoute } from "./app"

interface InsightsSearch {
  /** Seven days when absent. */
  range?: InsightsRange
}

function validateSearch(raw: Record<string, unknown>): InsightsSearch {
  const range = (INSIGHTS_RANGES as readonly unknown[]).includes(raw.range) ? (raw.range as InsightsRange) : undefined
  return range && range !== "7d" ? { range } : {}
}

function Page({ tab }: { tab: InsightsTab }) {
  const { range } = useSearch({ strict: false }) as InsightsSearch
  return <InsightsScreen page={tab} range={range ?? "7d"} />
}

// One route per page, so each has an address. Written out: the router's types need the literal paths.
const shared = { getParentRoute: () => appRoute, validateSearch }

export const insightsRoute = createRoute({
  ...shared,
  path: "insights",
  component: () => <Page tab="overview" />,
})

export const insightsSalesRoute = createRoute({
  ...shared,
  path: "insights/sales",
  component: () => <Page tab="sales" />,
})

export const insightsProductsRoute = createRoute({
  ...shared,
  path: "insights/products",
  component: () => <Page tab="products" />,
})

export const insightsServiceRoute = createRoute({
  ...shared,
  path: "insights/service",
  component: () => <Page tab="service" />,
})
