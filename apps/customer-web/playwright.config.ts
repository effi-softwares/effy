import { defineConfig, devices } from "@playwright/test"

/**
 * E2E for the storefront: proves what unit tests cannot (content present with no client code, Core Web
 * Vitals, deferred sign-in returning to the exact page, cross-pool tokens refused, async Server
 * Components). Runs against a production build, never `next dev`, whose bundles do not resemble what
 * ships.
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
    // A mid-range mobile device is the profile the CWV budgets are written against.
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],

  webServer: {
    command: "pnpm build && pnpm start",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
})
