import { StrictMode } from "react"
import { createRoot } from "react-dom/client"

import { createQueryClient, wireGlobalErrorReporting } from "@effy/web-kit"
import { QueryClientProvider } from "@tanstack/react-query"
import { RouterProvider } from "@tanstack/react-router"

import { ActionBarProvider } from "@effy/web-kit/action-bar"

import { configureAmplify } from "./lib/amplify"
import { assertConfig } from "./lib/env"
import { watchInstallability } from "./lib/install"
import { watchConnectivity } from "./lib/online"
import { registerServiceWorker } from "./lib/pwa"
import { startQueryPersistence } from "./lib/query-persist"
import { initTelemetry, reportError } from "./lib/telemetry"
import { applyTheme, uiStore } from "./lib/ui-store"
import { createAppRouter } from "./router"
import "./styles.css"

const rootEl = document.getElementById("root")
if (!rootEl) throw new Error("Missing #root element")

try {
  assertConfig()
  configureAmplify()
  initTelemetry()
  wireGlobalErrorReporting(reportError)
  applyTheme(uiStore.state.theme)

  registerServiceWorker()
  watchInstallability()

  const queryClient = createQueryClient()

  startQueryPersistence(queryClient, __BUILD_ID__)

  watchConnectivity(() => {
    void queryClient.invalidateQueries({ refetchType: "active" })
  })

  const router = createAppRouter(queryClient)

  createRoot(rootEl).render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        {/* The one floating action bar, over every screen (103). */}
        <ActionBarProvider>
          <RouterProvider router={router} />
        </ActionBarProvider>
      </QueryClientProvider>
    </StrictMode>,
  )
} catch (err) {
  const message = err instanceof Error ? err.message : String(err)
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
      <p style={{ color: "var(--muted-foreground)" }}>{message}</p>
    </div>,
  )
}
