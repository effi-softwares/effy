import { createRoute } from "@tanstack/react-router"

import { CatalogListScreen } from "@/features/catalog/CatalogListScreen"

import { appRoute } from "./app"

export const catalogRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "catalog",
  component: CatalogListScreen,
})
