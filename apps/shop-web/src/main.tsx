import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { createQueryClient, wireGlobalErrorReporting } from "@effy/web-kit";
import { QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";

import { configureAmplify } from "./lib/amplify";
import { assertConfig } from "./lib/env";
import { watchInstallability } from "./lib/install";
import { watchConnectivity } from "./lib/online";
import { registerServiceWorker } from "./lib/pwa";
import { startQueryPersistence } from "./lib/query-persist";
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

  // 059 — the console becomes installable and offline-survivable. Both no-op where unsupported, and
  // both are deliberately AFTER assertConfig: a console that cannot read its own config must fail
  // on that, not on a service worker.
  registerServiceWorker();
  watchInstallability();

  const queryClient = createQueryClient();

  // 059 FR-035 — the last-loaded screens survive a reload, so an installed console opened offline
  // has something to show. ⚠ Keyed on the build id: a cache restored into a build whose DTOs have
  // changed renders yesterday's shape into today's components, which is a screen quietly missing
  // fields rather than a crash.
  startQueryPersistence(queryClient, __BUILD_ID__);

  // 059 FR-037 — recover without a manual reload. `refetchType: "active"` refreshes only what is on
  // screen; a console with a dozen cached screens must not fire a dozen requests the moment a
  // tablet's wifi comes back.
  watchConnectivity(() => {
    void queryClient.invalidateQueries({ refetchType: "active" });
  });

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
