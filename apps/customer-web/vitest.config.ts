import { defineConfig } from "vitest/config"
import react from "@vitejs/plugin-react"
import tsconfigPaths from "vite-tsconfig-paths"

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
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    // e2e/ is Playwright's. Vitest must not try to run it.
    exclude: ["**/node_modules/**", "**/.next/**", "**/e2e/**"],
  },
})
