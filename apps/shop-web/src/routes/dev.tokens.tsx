import { createRoute } from "@tanstack/react-router";

import { TokensScreen } from "@/features/devtokens/TokensScreen";

import { appRoute } from "./app";

/**
 * `/dev/tokens`, the theme verification harness. Registered only under `import.meta.env.DEV` (router.tsx),
 * and its nav item is stripped from production too. It nests under `appRoute`, so it renders inside the
 * real shell with the real session guard.
 */
export const devTokensRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "dev/tokens",
  component: TokensScreen,
});
