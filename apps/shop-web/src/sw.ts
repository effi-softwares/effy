/// <reference lib="webworker" />
/**
 * The service worker for the shop console, and the only one: `src/lib/pwa.ts` registers it and hands the
 * registration to `getToken`, so Firebase never registers its own (two workers on one scope reload the app
 * after every deploy).
 *
 * It holds no credential and must not acquire one: a token here would outlive the tab and survive
 * sign-out. Decisions are pure functions in `src/lib/sw-logic.ts`; what remains here is wiring.
 */
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from "workbox-precaching"
import { NavigationRoute, registerRoute } from "workbox-routing"

import { clientToFocus, parsePush, planNotification, shouldSuppress } from "./lib/sw-logic"

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<{ url: string; revision: string | null }>
}

// Precache the app shell
precacheAndRoute(self.__WB_MANIFEST)
cleanupOutdatedCaches()

/**
 * Serve the precached app shell for any navigation.
 *
 * This is the offline experience, and there is deliberately no separate `offline.html`. The shell
 * is precached, so an installed console launched with no network boots React and renders the
 * console's own offline state — the same one an operator sees when the network drops mid-shift. A
 * second offline document would be a second place the message lives, and the two would diverge the
 * first time either was touched. One state, one wording.
 *
 * API calls are excluded, and nothing else runtime-caches them anywhere. Server state is TanStack
 * Query's business; a Workbox cache in front of it would be a second server-state cache, able to
 * answer a fresh query with a stale response and with nothing marking it stale. The read cache that
 * survives a reload is the Query cache itself, persisted — see `src/lib/query-persist.ts`.
 */
registerRoute(
  new NavigationRoute(createHandlerBoundToURL("/index.html"), {
    denylist: [/^\/api\//, /^\/shop\/v1\//, /^\/v1\//],
  }),
)

// Update handshake
//
// NO `self.skipWaiting` at the top level. Calling it unconditionally is what `autoUpdate` does,
// and it replaces the document under whoever is using it — a picker half-way through a pick list
// loses their place. The new worker waits until the page, having shown the operator a prompt they
// chose to accept, sends SKIP_WAITING.
self.addEventListener("message", (event: ExtendableMessageEvent) => {
  if ((event.data as { type?: string } | null)?.type === "SKIP_WAITING") {
    void self.skipWaiting()
  }
})

//
// Notifications
//
// Every decision below is made in `lib/sw-logic.ts`, which is unit-tested. What is left here is
// the parts that can only be wiring: reading IndexedDB, calling showNotification, matching clients.
// A service worker runs where nothing watches, so the less judgement it holds the better.
//

/**
 * The un-opened count per notification group.
 *
 * IndexedDB, not a module variable. A service worker is terminated aggressively between events
 * often within seconds — so an in-memory counter would reset between the first order and the second
 * and every banner would read "1 new order". IndexedDB survives the termination; that is the whole
 * reason the count is stored at all.
 */
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
      // Blocked storage (a private window, cleared site data) must never stop a notification being
      // shown — see the `push` handler: showing nothing costs the device its permission on iOS.
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

/**
 * A push arrived.
 *
 * This handler always shows something, and that is a platform rule rather than a courtesy: iOS
 * revokes notification permission from a service worker that receives a push and displays nothing.
 * A thrown parse error here would not lose one notification — it would cost that device every
 * future notification, permanently, with nothing reported anywhere. Hence the try/catch of last
 * resort around a payload we could not read at all.
 *
 * `event.waitUntil` wraps the whole chain. Without it the worker may be terminated before
 * `showNotification` resolves, which is the same silent permission loss by another route.
 */
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
          // `tag` + `renotify` together. `tag` alone replaces the banner silently, so orders two
          // through twenty would arrive with no alert at all; `renotify` without `tag` is ignored
          // entirely. Each is useless without the other, and both failures are invisible in a test
          // that only inspects the call.
          tag: plan.tag,
          renotify: true,
          icon: "/web-app-icon-192.png",
          // A monochrome asset, not the icon. Android renders `badge` as a silhouette — every
          // non-transparent pixel becomes white — so a full-colour icon arrives as a white blob.
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
        // Last resort. Whatever went wrong above — blocked storage, a clients call that threw
        // showing something is better than showing nothing, because nothing costs the permission.
        await self.registration.showNotification(data.title, {
          body: data.body,
          tag: data.tag,
          data: { webPath: data.webPath, type: data.type, group: data.group },
        } as NotificationOptions)
      }
    })(),
  )
})

/**
 * The operator tapped a notification. `includeUncontrolled: true` finds a window loaded before this worker
 * took control, so a second console is never opened. An existing client is navigated by `postMessage`, not
 * `client.navigate` (a full load that drops the cache and the operator's place).
 */
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
        // `notif_opened` is fired by the page from this message, not from here. A service worker
        // has no PostHog, and giving it one would mean giving it a credential.
        target.c.postMessage({ type: "NAVIGATE", path, notificationType: data.type })
        return
      }
      await self.clients.openWindow(path)
    })(),
  )
})

/** Dismissed without opening: the count stands down, but the work has not been done. */
self.addEventListener("notificationclose", (event: NotificationEvent) => {
  const data = (event.notification.data ?? {}) as { group?: string }
  if (!data.group) return
  event.waitUntil(writeCount(data.group, 0).then(() => undefined))
})
