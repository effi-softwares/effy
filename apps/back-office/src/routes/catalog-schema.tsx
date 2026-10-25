import { createRoute } from "@tanstack/react-router"

import { CatalogSchemaScreen } from "@/features/catalog-schema/CatalogSchemaScreen"

import { appRoute } from "./app"

export const catalogSchemaRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "catalog",
  component: CatalogSchemaScreen,
})
