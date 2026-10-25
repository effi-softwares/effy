/// <reference lib="webworker" />
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from "workbox-precaching"
import { NavigationRoute, registerRoute } from "workbox-routing"

import { clientToFocus, parsePush, planNotification, shouldSuppress } from "./lib/sw-logic"

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<{ url: string; revision: string | null }>
}

precacheAndRoute(self.__WB_MANIFEST)
cleanupOutdatedCaches()

registerRoute(
  new NavigationRoute(createHandlerBoundToURL("/index.html"), {
    denylist: [/^\/api\//, /^\/shop\/v1\//, /^\/v1\//],
  }),
)

self.addEventListener("message", (event: ExtendableMessageEvent) => {
  if ((event.data as { type?: string } | null)?.type === "SKIP_WAITING") {
    void self.skipWaiting()
  }
})

const DB_NAME = "effy-shop-notifications"
const STORE = "counts"

function withStore<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>) {
  return new Promise<T | null>((resolve) => {
    let settled = false
    const done = (v: T | null) => {
      if (!settled) {
        settled = true
        resolve(v)
      }
    }
    try {
      const open = indexedDB.open(DB_NAME, 1)
      open.onupgradeneeded = () => open.result.createObjectStore(STORE)
      open.onerror = () => done(null)
      open.onsuccess = () => {
        try {
          const req = fn(open.result.transaction(STORE, mode).objectStore(STORE))
          req.onsuccess = () => done(req.result)
          req.onerror = () => done(null)
        } catch {
          done(null)
        }
      }
    } catch {
      done(null)
    }
  })
}

const readCount = (group: string) =>
  withStore<number>("readonly", (s) => s.get(group) as IDBRequest<number>).then((v) => v ?? 0)

const writeCount = (group: string, n: number) =>
  withStore("readwrite", (s) => s.put(n, group) as IDBRequest<IDBValidKey>)

async function totalCount(): Promise<number> {
  const [orders, attention] = await Promise.all([readCount("orders"), readCount("attention")])
  return orders + attention
}

self.addEventListener("push", (event: PushEvent) => {
  event.waitUntil(
    (async () => {
      let data
      try {
        data = parsePush(event.data?.json())
      } catch {
        data = parsePush(null)
      }

      try {
        // Do not interrupt an operator who is demonstrably already looking at this.
        const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true })
        const visible = windows.map((c) => ({
          url: c.url,
          visibilityState: (c as WindowClient).visibilityState as string,
          focused: (c as WindowClient).focused,
        }))
        if (shouldSuppress(data, visible)) {
          // The screen is already live via 058's stream; nudge it and stay silent.
          for (const c of windows) c.postMessage({ type: "REFRESH" })
          return
        }

        const plan = planNotification(data, await readCount(data.group))
        await writeCount(data.group, plan.count)

        await self.registration.showNotification(plan.title, {
          body: plan.body,
          tag: plan.tag,
          renotify: true,
          icon: "/web-app-icon-192.png",
          badge: "/notification-badge-96.png",
          data: { webPath: plan.webPath, type: data.type, group: plan.group },
        } as NotificationOptions)

        // The app-icon badge, where the OS supports one.
        if ("setAppBadge" in self.navigator) {
          await (self.navigator as Navigator & { setAppBadge(n: number): Promise<void> })
            .setAppBadge(await totalCount())
            .catch(() => undefined)
        }
      } catch {
        await self.registration.showNotification(data.title, {
          body: data.body,
          tag: data.tag,
          data: { webPath: data.webPath, type: data.type, group: data.group },
        } as NotificationOptions)
      }
    })(),
  )
})

self.addEventListener("notificationclick", (event: NotificationEvent) => {
  event.notification.close()
  const data = (event.notification.data ?? {}) as { webPath?: string; type?: string; group?: string }
  const path = typeof data.webPath === "string" ? data.webPath : "/"

  event.waitUntil(
    (async () => {
      // Opened means dealt with: reset this group and the badge.
      if (data.group) await writeCount(data.group, 0)
      if ("clearAppBadge" in self.navigator) {
        const total = await totalCount()
        const nav = self.navigator as Navigator & {
          setAppBadge(n: number): Promise<void>
          clearAppBadge(): Promise<void>
        }
        await (total > 0 ? nav.setAppBadge(total) : nav.clearAppBadge()).catch(() => undefined)
      }

      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true })
      const target = clientToFocus(windows.map((c) => ({ url: c.url, focused: c.focused, c })))

      if (target) {
        await target.c.focus()
        target.c.postMessage({ type: "NAVIGATE", path, notificationType: data.type })
        return
      }
      await self.clients.openWindow(path)
    })(),
  )
})

self.addEventListener("notificationclose", (event: NotificationEvent) => {
  const data = (event.notification.data ?? {}) as { group?: string }
  if (!data.group) return
  event.waitUntil(writeCount(data.group, 0).then(() => undefined))
})
