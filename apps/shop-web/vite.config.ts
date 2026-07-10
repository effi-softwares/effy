import { fileURLToPath, URL } from "node:url";

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// Vite + React 19 SPA. Runs on :5174 — an APPROVED dev CORS origin (edge-gateway.tf allow_origins).
// strictPort matters: a silent port bump lands on an unapproved origin and every API call fails CORS
// with an error that looks nothing like the cause (contracts/config.contract.md).
export default defineConfig({
  plugins: [react(), tailwindcss()],
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
  },
});
