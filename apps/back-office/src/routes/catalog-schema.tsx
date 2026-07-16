import { createRoute } from "@tanstack/react-router";

import { CatalogSchemaScreen } from "@/features/catalog-schema/CatalogSchemaScreen";

import { appRoute } from "./app";

// Catalog schema authority (016, US1). Nests under the protected app shell (appRoute) so the session
// guard runs first. Read access is open to any signed-in back-office role; mutating controls are
// gated in the screen (and independently enforced by the backend).
export const catalogSchemaRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "catalog",
  component: CatalogSchemaScreen,
});
