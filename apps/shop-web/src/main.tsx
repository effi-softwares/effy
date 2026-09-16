import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { createQueryClient, wireGlobalErrorReporting } from "@effy/web-kit";
import { QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";

import { configureAmplify } from "./lib/amplify";
import { assertConfig } from "./lib/env";
import { initTelemetry, reportError } from "./lib/telemetry";
import { applyTheme, uiStore } from "./lib/ui-store";
import { createAppRouter } from "./router";
// Typeface: Geist arrives from Google Fonts in index.html (it has no woff2 to commit), with
// self-hosted General Sans named second in --font-sans as the fallback. Nothing to import here.
import "./styles.css";

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("Missing #root element");

try {
  // Fail-fast on missing config (FR-017), then wire the app top-down (explicit, no DI framework).
  assertConfig();
  configureAmplify();
  initTelemetry();
  wireGlobalErrorReporting(reportError);
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
  // A clear, non-technical failure — never a white screen (FR-011 / FR-017).
  const message = err instanceof Error ? err.message : String(err);
  createRoot(rootEl).render(
    <div
      style={{
        // ⚠ DELIBERATELY NOT --font-sans. This is the pre-app failure screen; it renders when
        // assertConfig() throws, and the one thing it must never do is depend on something that
        // might also have failed. The COLOUR is a token because styles.css is imported above this
        // and has already applied; the FACE stays a system stack because a webfont is a network
        // request, and a config error must not render as invisible text while one is in flight.
        fontFamily: "system-ui, sans-serif",
        padding: "2rem",
        maxWidth: 640,
        margin: "0 auto",
      }}
    >
      <h1 style={{ fontSize: "1.25rem" }}>Configuration error</h1>
      <p style={{ color: "var(--muted-foreground)" }}>{message}</p>
    </div>,
  );
}
