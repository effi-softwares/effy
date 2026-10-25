import { fileURLToPath, URL } from "node:url"

import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vitest/config"
import { VitePWA } from "vite-plugin-pwa"

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),

    // Installable, with the app shell precached and updates applied on staff's say-so (src/lib/pwa.ts).
    // No push: nothing sends back-office notifications.
    VitePWA({
      strategies: "injectManifest",
      srcDir: "src",
      filename: "sw.ts",

      registerType: "prompt",
      injectRegister: null,

      devOptions: { enabled: false, type: "module" },

      injectManifest: {
        // pwa.ts registers a classic worker; an ES-module build would work only by accident (059).
        rollupFormat: "iife",
        globPatterns: ["**/*.{js,css,html,ico,png,svg,webmanifest,woff,woff2}"],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
      },

      manifest: {
        name: "Effy Back-Office",
        short_name: "Effy Back-Office",
        description: "Effy back-office console — orders, delivery, drivers, shops and catalogue.",
        display: "standalone",
        orientation: "any",
        start_url: "/",
        scope: "/",
        id: "/",
        lang: "en-AU",
        background_color: "#ffffff",
        theme_color: "#1d4ed8",
        icons: [
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
  server: { port: 5173, strictPort: true },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    css: false,
    exclude: ["**/node_modules/**", "**/dist/**", "src/sw.ts"],
  },
})
