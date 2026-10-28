import { createRoute } from "@tanstack/react-router"

import { catalogList, CatalogListScreen } from "@/features/catalog/CatalogListScreen"

import { appRoute } from "./app"

export const catalogRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "catalog",
  validateSearch: (raw: Record<string, unknown>) => catalogList.validateSearch(raw),
  component: CatalogListScreen,
})
