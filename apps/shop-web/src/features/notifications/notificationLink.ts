// A tapped notification's id travels on the console address (109): `?notification=<id>&notification_type=<type>`.
// The service worker adds it; the signed-in console reads it once, records the read and removes it. Because it is part
// of the address it survives a sign-in (the guard's `next` keeps the whole address) and a newly opened window.

export const NOTIFICATION_PARAM = "notification"
export const NOTIFICATION_TYPE_PARAM = "notification_type"

/** `path` (a console path from `shopPathFor`) with the notification's id and type added. No id → `path` unchanged. */
export function withNotification(path: string, notificationId: string | undefined, type: string | undefined): string {
  if (!notificationId) return path
  const [base, query = ""] = path.split("?", 2)
  const params = new URLSearchParams(query)
  params.set(NOTIFICATION_PARAM, notificationId)
  if (type) params.set(NOTIFICATION_TYPE_PARAM, type)
  return `${base}?${params.toString()}`
}

/** The notification carried by `search` (a `location.search` string), and the search string without it. */
export function takeNotification(search: string): { notificationId: string; type: string; rest: string } | null {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search)
  const notificationId = params.get(NOTIFICATION_PARAM)
  if (!notificationId) return null
  const type = params.get(NOTIFICATION_TYPE_PARAM) ?? "unknown"
  params.delete(NOTIFICATION_PARAM)
  params.delete(NOTIFICATION_TYPE_PARAM)
  const rest = params.toString()
  return { notificationId, type, rest: rest ? `?${rest}` : "" }
}
