import { createRequire } from "node:module"

import { defineConfig } from "vitest/config"
import react from "@vitejs/plugin-react"
import tsconfigPaths from "vite-tsconfig-paths"

// Resolve React from THIS app's node_modules so every module — including the design-system consumed
// as source — shares one copy.
const require = createRequire(import.meta.url)
const r = (m: string) => require.resolve(m)

/**
 * Unit tests for the customer storefront.
 *
 * ⚠ READ THIS BEFORE YOU TRY TO UNIT-TEST A PAGE.
 *
 * **Vitest cannot test async Server Components.** This is not a configuration problem you can
 * solve here — it is a documented limitation (Next 16 docs, `02-guides/testing/vitest.md`):
 *
 *   "Since `async` Server Components are new to the React ecosystem, Vitest currently does not
 *    support them. While you can still run unit tests for synchronous Server and Client
 *    Components, we recommend using E2E tests for `async` components."
 *
 * Most of this surface's interesting components — the cached page bodies, the streamed
 * UserIsland — are exactly that. So the test strategy is deliberately split:
 *
 *   • Vitest (here)  → plain async data functions, DTO↔domain mappers, the `next` redirect
 *                      validator, the consent gate, client components, pure decision logic.
 *   • Playwright     → anything rendered. SSR/SEO (SC-004), the three credential routes,
 *                      the deferred sign-in return (SC-008), cross-pool refusal (SC-012).
 *
 * If you are here because you wanted to assert on rendered page HTML: you want `e2e/`.
 */
export default defineConfig({
  plugins: [react(), tsconfigPaths()],
  // The design-system is consumed as SOURCE (tsconfig paths), and its own dev React can resolve to a
  // different 19.x than this app's — two React copies null the hooks dispatcher the moment a
  // design-system overlay (Dialog/Drawer, used by the address book) renders in a test. Anchored
  // aliases pin every `react`/`react-dom` import to this app's single copy.
  resolve: {
    dedupe: ["react", "react-dom"],
    alias: [
      { find: /^react$/, replacement: r("react") },
      { find: /^react-dom$/, replacement: r("react-dom") },
      { find: /^react-dom\/client$/, replacement: r("react-dom/client") },
      { find: /^react\/jsx-runtime$/, replacement: r("react/jsx-runtime") },
      { find: /^react\/jsx-dev-runtime$/, replacement: r("react/jsx-dev-runtime") },
    ],
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    // e2e/ is Playwright's. Vitest must not try to run it.
    exclude: ["**/node_modules/**", "**/.next/**", "**/e2e/**"],
    // Inline the overlay libraries (Radix, vaul) so vite — and the React aliases above — resolve
    // their `react` imports, instead of node pulling the design-system tree's second React copy.
    server: { deps: { inline: [/@radix-ui\//, "vaul"] } },
  },
})
