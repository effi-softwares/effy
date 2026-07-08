import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";

import { configureAmplify } from "./lib/amplify";
import { assertConfig } from "./lib/env";
import { createQueryClient } from "./lib/query-client";
import { initTelemetry } from "./lib/telemetry";
import { applyTheme, uiStore } from "./lib/ui-store";
import { createAppRouter } from "./router";
import "./styles.css";

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("Missing #root element");

try {
  // Fail-fast on missing config (FR-014), then wire the app top-down (explicit, no DI framework).
  assertConfig();
  configureAmplify();
  initTelemetry();
  applyTheme(uiStore.state.theme);

  const queryClient = createQueryClient();
  const router = createAppRouter(queryClient);

  createRoot(rootEl).render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </StrictMode>,
  );
} catch (err) {
  // Clear, non-technical failure (never a white screen) — FR-014 / FR-009.
  const message = err instanceof Error ? err.message : String(err);
  createRoot(rootEl).render(
    <div
      style={{
        fontFamily: "system-ui, sans-serif",
        padding: "2rem",
        maxWidth: 640,
        margin: "0 auto",
      }}
    >
      <h1 style={{ fontSize: "1.25rem" }}>Configuration error</h1>
      <p style={{ color: "#5c6b64" }}>{message}</p>
    </div>,
  );
}
