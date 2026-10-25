import { StrictMode } from "react"
import { createRoot } from "react-dom/client"

import { createQueryClient, trackInputModality, wireGlobalErrorReporting } from "@effy/web-kit"
import { QueryClientProvider } from "@tanstack/react-query"
import { RouterProvider } from "@tanstack/react-router"

import { configureAmplify } from "./lib/amplify"
import { assertConfig } from "./lib/env"
import { registerServiceWorker } from "./lib/pwa"
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
  // Focus rings for keyboard navigation only, never after a click or tap.
  trackInputModality()
  applyTheme(uiStore.state.theme)

  registerServiceWorker()

  const queryClient = createQueryClient()
  const router = createAppRouter(queryClient)

  createRoot(rootEl).render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
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
