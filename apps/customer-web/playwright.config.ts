import { defineConfig, devices } from "@playwright/test"

/**
 * E2E for the customer storefront.
 *
 * This is not a nice-to-have layer on top of the unit tests — it is the ONLY way several of
 * this slice's headline promises can be proven at all:
 *
 *   • SC-004 — "content is present with NO client-side code executed". Only a raw HTTP fetch
 *     can prove that. No unit test can.
 *   • SC-002 — Core Web Vitals on a real page.
 *   • SC-008 — the deferred sign-in returns the shopper to their exact destination.
 *   • SC-012 — a cross-pool token is refused, both directions.
 *   • Async Server Components — untestable by Vitest (see vitest.config.ts).
 *
 * ⚠ It runs against a PRODUCTION build (`next build && next start`), never `next dev`.
 * Dev-mode bundles, caching and prerendering do not resemble what ships, so a green dev-mode
 * E2E would be proving the wrong artifact.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",

  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    trace: "on-first-retry",
  },

  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    // A mid-range mobile device is the profile the CWV budgets (D7) are written against.
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],

  webServer: {
    command: "pnpm build && pnpm start",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
})
