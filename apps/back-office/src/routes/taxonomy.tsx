import { createRoute } from "@tanstack/react-router"

import { TaxonomyScreen } from "@/features/taxonomy/TaxonomyScreen"

import { appRoute } from "./app"

export type TaxonomyTab = "categories" | "attributes"

export const taxonomyRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "taxonomy",
  validateSearch: (search: Record<string, unknown>): { tab?: TaxonomyTab; category?: string } => ({
    tab: search.tab === "attributes" ? "attributes" : undefined,
    category: typeof search.category === "string" ? search.category : undefined,
  }),
  component: TaxonomyRouteComponent,
})

function TaxonomyRouteComponent() {
  const { tab, category } = taxonomyRoute.useSearch()
  return <TaxonomyScreen tab={tab ?? "categories"} categoryId={category ?? null} />
}
