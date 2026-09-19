/// <reference lib="webworker" />
/**
 * THE service worker for the shop console (059).
 *
 * ⚠ "THE", NOT "A". There is exactly one, and that is a hard constraint rather than tidiness: the
 * Firebase JS SDK registers its own `/firebase-messaging-sw.js` by default, and beside a Workbox
 * worker that is two workers competing for one scope. The documented symptom is THE APP RELOADING
 * ITSELF CONTINUOUSLY after every deploy (vite-plugin-pwa #777). `src/lib/pwa.ts` registers this
 * file and hands the registration to `getToken({ serviceWorkerRegistration })`, so the SDK never
 * registers its own. `src/lib/__tests__/pwa.test.ts` asserts there is one registration call site.
 *
 * ⚠ THIS FILE HOLDS NO CREDENTIAL, AND MUST NOT ACQUIRE ONE. It shows notifications and opens URLs;
 * the page authenticates. A token placed in a service worker outlives the tab that put it there and
 * survives sign-out, which is the opposite of what sign-out means.
 *
 * ⚠ KEEP THE LOGIC OUT OF HERE. Everything decidable is a pure function in `src/lib/sw-logic.ts`,
 * which is unit-tested in jsdom. What remains here is wiring, because a service worker cannot be
 * meaningfully tested — 024 shipped a drawable that compiled, packaged and inflated to nothing, and
 * 058 shipped a stream that would have died at 30 seconds while every test passed. Code that only
 * runs where nothing watches should be as small as it can be.
 */
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from "workbox-precaching"
import { NavigationRoute, registerRoute } from "workbox-routing"

import { clientToFocus, parsePush, planNotification, shouldSuppress } from "./lib/sw-logic"

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<{ url: string; revision: string | null }>
}

// ── Precache the app shell (FR-034, US5) ────────────────────────────────────────────────────────
precacheAndRoute(self.__WB_MANIFEST)
cleanupOutdatedCaches()

/**
 * Serve the precached app shell for any navigation.
 *
 * ⚠ THIS IS THE OFFLINE EXPERIENCE, AND THERE IS DELIBERATELY NO SEPARATE `offline.html`. The shell
 * is precached, so an installed console launched with no network boots React and renders the
 * console's OWN offline state — the same one an operator sees when the network drops mid-shift. A
 * second offline document would be a second place the message lives, and the two would diverge the
 * first time either was touched. One state, one wording.
 *
 * ⚠ API CALLS ARE EXCLUDED, AND NOTHING ELSE RUNTIME-CACHES THEM ANYWHERE. Server state is TanStack
 * Query's business; a Workbox cache in front of it would be a SECOND server-state cache, able to
 * answer a fresh query with a stale response and with nothing marking it stale. The read cache that
 * survives a reload is the Query cache itself, persisted — see `src/lib/query-persist.ts`.
 */
registerRoute(
  new NavigationRoute(createHandlerBoundToURL("/index.html"), {
    denylist: [/^\/api\//, /^\/shop\/v1\//, /^\/v1\//],
  }),
)

// ── Update handshake (FR-010) ───────────────────────────────────────────────────────────────────
//
// ⚠ NO `self.skipWaiting()` AT THE TOP LEVEL. Calling it unconditionally is what `autoUpdate` does,
// and it replaces the document under whoever is using it — a picker half-way through a pick list
// loses their place. The new worker waits until the page, having shown the operator a prompt they
// chose to accept, sends SKIP_WAITING.
self.addEventListener("message", (event: ExtendableMessageEvent) => {
  if ((event.data as { type?: string } | null)?.type === "SKIP_WAITING") {
    void self.skipWaiting()
  }
})

// ════════════════════════════════════════════════════════════════════════════════════════════════
// Notifications (059, US1)
//
// ⚠ EVERY DECISION BELOW IS MADE IN `lib/sw-logic.ts`, WHICH IS UNIT-TESTED. What is left here is
// the parts that can only be wiring: reading IndexedDB, calling showNotification, matching clients.
// A service worker runs where nothing watches, so the less judgement it holds the better.
// ════════════════════════════════════════════════════════════════════════════════════════════════

/**
 * The un-opened count per notification group.
 *
 * ⚠ IndexedDB, NOT A MODULE VARIABLE. A service worker is terminated aggressively between events —
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
      // ⚠ Blocked storage (a private window, cleared site data) must never stop a notification being
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
 * ⚠ THIS HANDLER ALWAYS SHOWS SOMETHING, and that is a platform rule rather than a courtesy: iOS
 * REVOKES notification permission from a service worker that receives a push and displays nothing.
 * A thrown parse error here would not lose one notification — it would cost that device every
 * future notification, permanently, with nothing reported anywhere. Hence the try/catch of last
 * resort around a payload we could not read at all.
 *
 * ⚠ `event.waitUntil` WRAPS THE WHOLE CHAIN. Without it the worker may be terminated before
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
        // FR-030 — do not interrupt an operator who is demonstrably already looking at this.
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
          // ⚠ `tag` + `renotify` TOGETHER. `tag` alone replaces the banner SILENTLY, so orders two
          // through twenty would arrive with no alert at all; `renotify` without `tag` is ignored
          // entirely. Each is useless without the other, and both failures are invisible in a test
          // that only inspects the call.
          tag: plan.tag,
          renotify: true,
          icon: "/web-app-icon-192.png",
          // ⚠ A MONOCHROME asset, not the icon. Android renders `badge` as a silhouette — every
          // non-transparent pixel becomes white — so a full-colour icon arrives as a white blob.
          badge: "/notification-badge-96.png",
          data: { webPath: plan.webPath, type: data.type, group: plan.group },
        } as NotificationOptions)

        // FR-032 — the app-icon badge, where the OS supports one.
        if ("setAppBadge" in self.navigator) {
          await (self.navigator as Navigator & { setAppBadge(n: number): Promise<void> })
            .setAppBadge(await totalCount())
            .catch(() => undefined)
        }
      } catch {
        // ⚠ LAST RESORT. Whatever went wrong above — blocked storage, a clients call that threw —
        // showing SOMETHING is better than showing nothing, because nothing costs the permission.
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
 * The operator tapped a notification (FR-014).
 *
 * ⚠ `includeUncontrolled: true` IS LOAD-BEARING. A window loaded before this worker took control is
 * not controlled by it and is INVISIBLE to `matchAll` without the flag — so the worker would open a
 * SECOND console beside the one already open, which is exactly what FR-014 forbids.
 *
 * ⚠ AN EXISTING CLIENT IS NAVIGATED BY `postMessage`, NOT BY `client.navigate()`. The latter is a
 * full document load: it discards the Query cache, the operator's scroll position and whatever they
 * were half-way through. The page's router handles the message instead.
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
        // ⚠ `notif_opened` is fired by the PAGE from this message, not from here. A service worker
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
