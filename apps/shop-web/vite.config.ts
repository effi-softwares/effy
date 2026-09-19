import { fileURLToPath, URL } from "node:url";

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";
import { VitePWA } from "vite-plugin-pwa";

// Vite + React 19 SPA. Runs on :5174 — an APPROVED dev CORS origin (edge-gateway.tf allow_origins).
// strictPort matters: a silent port bump lands on an unapproved origin and every API call fails CORS
// with an error that looks nothing like the cause (contracts/config.contract.md).
export default defineConfig({
  // ⚠ The cache buster for the persisted Query cache. A content-derived id would be ideal; the build
  // time is enough, because the only thing this must guarantee is that a NEW deploy does not restore
  // an OLD build's cache (see src/lib/query-persist.ts).
  define: {
    __BUILD_ID__: JSON.stringify(process.env.BUILD_ID ?? String(Date.now())),
  },
  plugins: [
    react(),
    tailwindcss(),

    // ── 059: the console becomes an installable app ────────────────────────────────────────────
    //
    // ⚠ `injectManifest`, NOT `generateSW`, AND THAT IS NOT A PREFERENCE.
    //
    // 1. `generateSW` produces a service worker we cannot add `push` or `notificationclick`
    //    handlers to, and this slice's entire notification behaviour lives in those two handlers —
    //    coalescing by tag, the app badge, focusing an already-open window rather than opening a
    //    second one.
    //
    // 2. ⚠ THERE MUST BE EXACTLY ONE SERVICE WORKER. The Firebase JS SDK registers its OWN
    //    `/firebase-messaging-sw.js` by default. Beside a Workbox service worker that is two
    //    workers competing for one scope, and the documented symptom is THE APP RELOADING ITSELF
    //    CONTINUOUSLY after every deploy (vite-plugin-pwa #777). `src/lib/pwa.ts` registers this
    //    one and passes the registration to `getToken({ serviceWorkerRegistration })`, so Firebase
    //    never registers its own.
    VitePWA({
      strategies: "injectManifest",
      srcDir: "src",
      filename: "sw.ts",

      // ⚠ PROMPT, NEVER autoUpdate (FR-010). `autoUpdate` + `clientsClaim` swaps the page under
      // whoever is using it — a picker half-way through a pick list has the document replaced. The
      // operator is offered the new version and chooses when.
      registerType: "prompt",
      // We register by hand in src/lib/pwa.ts so the update prompt and the Firebase registration
      // share one registration object. The plugin's auto-injected registration would be a second.
      injectRegister: null,

      // ⚠ The service worker is a MODULE in dev so `import` works while running `vite dev`, and
      // classic in the build. Without `type: "module"` here the dev SW fails to parse and the
      // symptom is "nothing happens", which reads as "PWAs do not work in dev".
      devOptions: { enabled: false, type: "module" },

      injectManifest: {
        // ⚠ `iife`, NOT the plugin's default `es`. `src/lib/pwa.ts` registers the worker as a
        // CLASSIC script, and a classic worker cannot parse a top-level `import`/`export`. Today the
        // bundle happens to contain neither, so `es` would work by accident — until a dependency
        // change emits one, at which point registration fails **only in a real browser**: every
        // test still passes, the build still succeeds, and the console silently loses offline
        // support and notifications. Pinning the format makes the accident impossible. This is 024's
        // VectorDrawable and 058's WriteTimeout shape — valid, compiling, tested, wrong only where
        // it runs.
        rollupFormat: "iife",
        globPatterns: ["**/*.{js,css,html,ico,png,svg,webmanifest,woff,woff2}"],
        // The console is a login-gated internal app; its bundle is large (recharts alone is ~400 KB)
        // and precaching it is the point — an installed app that cannot open offline is worse than
        // a tab. Raised from the 2 MiB default, deliberately and with the number stated.
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
      },

      // ⚠ `manifest.webmanifest`, and the Amplify rewrite allow-list had to learn that extension
      // first (infra/envs/dev/amplify-consoles.tf). Without that fix this file is fetched, the SPA
      // rewrite returns the app shell as HTML with status 200, and the console is simply NOT
      // INSTALLABLE — with no error in the page, the build, any test or any log.
      manifest: {
        name: "Effy Shop Console",
        short_name: "Effy Shop",
        description: "Effy shop operator console — orders, picking, catalog and stock.",
        // ⚠ standalone is what makes the Push API reachable on iPadOS at all: there, the API exists
        // only for a home-screen web app. On this audience's primary device, installability is the
        // precondition for notifications, not a convenience.
        display: "standalone",
        // The console is tablet-first in landscape (007 FR-003a) — but `orientation` is a HINT, not
        // a lock, and locking it would make the console unusable on the phone an operator actually
        // has in their hand during a stock take.
        orientation: "any",
        start_url: "/",
        scope: "/",
        id: "/",
        lang: "en-AU",
        // ⚠ FROM THE DESIGN SYSTEM'S OWN VALUES, not a new colour. `--background` light (#ffffff)
        // and `--brand` light (#1d4ed8) — this slice adds no token, so `tokens:check` must pass
        // UNCHANGED, which is the mechanical proof nothing reached the three mobile Compose themes.
        background_color: "#ffffff",
        theme_color: "#1d4ed8",
        icons: [
          // ⚠ BOTH PURPOSES. Declaring only `maskable` makes a launcher that expects an unmasked
          // icon show a visibly over-zoomed mark, because the maskable asset already carries the
          // safe-zone padding the launcher is about to add again. Generated by @effy/brand from the
          // one authored mark; `make brand-check` fails and names any that drift.
          { src: "/web-app-icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
          { src: "/web-app-icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
          {
            src: "/web-app-manifest-192x192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "maskable",
          },
          {
            src: "/web-app-manifest-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  server: { port: 5174, strictPort: true },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    css: false,
    // The service worker is compiled by the plugin, not by vitest; its logic is unit-tested through
    // `src/lib/sw-logic.ts`, which is plain functions with no service-worker globals.
    exclude: ["**/node_modules/**", "**/dist/**", "src/sw.ts"],
  },
});
