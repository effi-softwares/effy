/**
 * Everything the service worker decides, as pure functions, so the worker stays almost empty (nothing
 * tests code that runs there). Nothing here touches a service-worker global, so it runs in jsdom.
 */

/** The `data` block the sender puts on a web message (`worker/copy.ts` → `dataFor`). */
export interface PushData {
  type: string
  entityId: string
  webPath: string
  title: string
  body: string
  tag: string
  group: string
}

/** What the worker should show, after deciding. */
export interface NotificationPlan {
  title: string
  body: string
  tag: string
  group: string
  /** Where a click goes. Always a same-origin path. */
  webPath: string
  /** How many un-opened notifications this group now stands for. */
  count: number
}

const FALLBACK: PushData = {
  type: "unknown",
  entityId: "",
  webPath: "/",
  title: "Effy Shop",
  body: "Something needs your attention.",
  tag: "effy",
  group: "orders",
}

/**
 * Read a push payload, and never throw.
 *
 * The fallback is not defensive padding — it is the requirement. iOS revokes
 * notification permission from a service worker that receives a push and displays nothing. So a
 * thrown parse error would not lose one notification; it would cost that device every future
 * notification, permanently, with nothing surfaced anywhere. A malformed payload still produces
 * something showable.
 */
export function parsePush(raw: unknown): PushData {
  if (typeof raw !== "object" || raw === null) return FALLBACK
  const d = raw as Record<string, unknown>
  const str = (k: keyof PushData, fallback: string): string =>
    typeof d[k] === "string" && (d[k] as string).length > 0 ? (d[k] as string) : fallback

  return {
    type: str("type", FALLBACK.type),
    entityId: str("entityId", ""),
    // Same-origin only. `webPath` arrives over the network, and a payload that could set an
    // absolute URL would make a notification click an open redirect out of the console. A leading
    // "//" is a protocol-relative URL, which is why the second check is not redundant.
    webPath: safePath(str("webPath", FALLBACK.webPath)),
    title: str("title", FALLBACK.title),
    body: str("body", FALLBACK.body),
    tag: str("tag", FALLBACK.tag),
    group: str("group", FALLBACK.group),
  }
}

/** Reduce anything to a same-origin path, or "/". */
export function safePath(input: string): string {
  if (!input.startsWith("/") || input.startsWith("//")) return "/"
  return input
}

/**
 * Should this push be shown? Only a visible client already on the destination is a reason to stay quiet
 * (that screen updates itself); a background tab or a locked tablet is not someone looking.
 */
export function shouldSuppress(
  data: PushData,
  clients: ReadonlyArray<{ url: string; visibilityState?: string; focused?: boolean }>,
): boolean {
  return clients.some((c) => {
    if (c.visibilityState !== "visible") return false
    let path: string
    try {
      path = new URL(c.url).pathname
    } catch {
      return false
    }
    return path === data.webPath || path.startsWith(`${data.webPath}/`)
  })
}

/**
 * Build what to show, given how many un-opened notifications this group already stands for. A shared
 * `tag` replaces the banner rather than stacking, and the count keeps that collapse honest ("20 new
 * orders", not one).
 */
export function planNotification(data: PushData, previousCount: number): NotificationPlan {
  const count = previousCount + 1
  if (count <= 1) {
    return { ...data, count }
  }

  if (data.group === "orders") {
    return {
      ...data,
      title: `${count} new orders to pick`,
      body: "Open the queue to start picking.",
      // The collapsed notification leads to the list, not to the newest order. Taking the operator
      // to one of twenty is arbitrary and hides the other nineteen.
      webPath: "/orders",
      count,
    }
  }

  return {
    ...data,
    title: `${count} things need attention`,
    body: "Open the console to see what.",
    webPath: "/orders",
    count,
  }
}

/**
 * Pick the client to focus for a notification click, if any.
 *
 * Reuse beats open, always. Without this an operator working a shift accumulates one console
 * window per notification. Returning `null` means "open a new one".
 */
export function clientToFocus<T extends { url: string; focused?: boolean }>(
  clients: readonly T[],
): T | null {
  if (clients.length === 0) return null
  // Prefer a focused window, then any window. Either is better than a second one.
  return clients.find((c) => c.focused) ?? clients[0] ?? null
}
