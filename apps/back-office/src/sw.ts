/// <reference lib="webworker" />
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from "workbox-precaching"
import { NavigationRoute, registerRoute } from "workbox-routing"

// Installability and a fast, versioned app shell only. Back-office is sent no push, and its data is
// never cached here: it lives on the staff gateway's own origin and is read live every time.
declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<{ url: string; revision: string | null }>
}

precacheAndRoute(self.__WB_MANIFEST)
cleanupOutdatedCaches()

// Every deep link is the SPA shell (the same rewrite Amplify applies).
registerRoute(new NavigationRoute(createHandlerBoundToURL("/index.html")))

self.addEventListener("message", (event: ExtendableMessageEvent) => {
  if ((event.data as { type?: string } | null)?.type === "SKIP_WAITING") {
    void self.skipWaiting()
  }
})
