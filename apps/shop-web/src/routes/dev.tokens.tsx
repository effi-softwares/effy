import { createRoute } from "@tanstack/react-router";

import { TokensScreen } from "@/features/devtokens/TokensScreen";

import { appRoute } from "./app";

/**
 * `/dev/tokens` — the theme-adoption verification harness (Phases 1 and 2).
 *
 * ⚠ REGISTERED ONLY UNDER `import.meta.env.DEV` (see router.tsx), and its sidebar item (Workspace ·
 * Tokens, per the imported design) is stripped from production the same way (components/layout/nav.ts).
 * It is a developer tool, not a feature: shipping it would put a page of colour swatches inside a
 * console whose nav the operator reads at a glance.
 *
 * ⚠ It still nests under `appRoute`, so it renders inside the real shell with the real session
 * guard. A gallery rendered outside the shell proves the components work in isolation and says
 * nothing about whether they work where they actually live — which is the gap that let 039 ship four
 * live defects with a fully green suite.
 */
export const devTokensRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "dev/tokens",
  component: TokensScreen,
});
