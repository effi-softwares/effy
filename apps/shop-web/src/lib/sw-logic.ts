interface PushData {
  type: string
  entityId: string
  webPath: string
  title: string
  body: string
  tag: string
  group: string
}

interface NotificationPlan {
  title: string
  body: string
  tag: string
  group: string
  webPath: string
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

export function parsePush(raw: unknown): PushData {
  if (typeof raw !== "object" || raw === null) return FALLBACK
  const d = raw as Record<string, unknown>
  const str = (k: keyof PushData, fallback: string): string =>
    typeof d[k] === "string" && (d[k] as string).length > 0 ? (d[k] as string) : fallback

  return {
    type: str("type", FALLBACK.type),
    entityId: str("entityId", ""),
    webPath: safePath(str("webPath", FALLBACK.webPath)),
    title: str("title", FALLBACK.title),
    body: str("body", FALLBACK.body),
    tag: str("tag", FALLBACK.tag),
    group: str("group", FALLBACK.group),
  }
}

export function safePath(input: string): string {
  if (!input.startsWith("/") || input.startsWith("//")) return "/"
  return input
}

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

export function clientToFocus<T extends { url: string; focused?: boolean }>(clients: readonly T[]): T | null {
  if (clients.length === 0) return null
  // Prefer a focused window, then any window. Either is better than a second one.
  return clients.find((c) => c.focused) ?? clients[0] ?? null
}
