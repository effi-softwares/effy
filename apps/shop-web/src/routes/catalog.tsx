import { createRoute } from "@tanstack/react-router";

import { CatalogListScreen } from "@/features/catalog/CatalogListScreen";

import { appRoute } from "./app";

// The catalog list (US3), nested under the protected shell so its `beforeLoad` guards the session.
export const catalogRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "catalog",
  component: CatalogListScreen,
});
