import { keepPreviousData, queryOptions, useMutation, useQueryClient } from "@tanstack/react-query"

import { isDomainError } from "@effy/api-client"
import type { NotificationReadResponseDTO } from "@effy/shared-types"

import { api } from "@/lib/api"

export type NotificationSection = "orders" | "stock" | "refunds" | "effy"

interface NotificationTypeInfo {
  type: string
  label: string
  group: string
  section: NotificationSection
  requiresRole?: string
}

interface NotificationPreferences {
  registered: boolean
  platform: string | null
  mutedTypes: string[]
  availableTypes: NotificationTypeInfo[]
}

const PREFS_KEY = ["shop", "notification-preferences"] as const

export function preferencesQuery(fcmToken: string | null) {
  return queryOptions({
    queryKey: [...PREFS_KEY, fcmToken ?? "none"],
    // Without a token the server answers the unregistered shape, so the screen lists the types before sign-up.
    queryFn: (): Promise<NotificationPreferences> =>
      api.get<NotificationPreferences>(
        fcmToken
          ? `/shop/v1/notification-preferences?token=${encodeURIComponent(fcmToken)}`
          : "/shop/v1/notification-preferences",
      ),
    staleTime: 30_000,
    // Turning on swaps the key from "none" to the token; keep the list on screen meanwhile.
    placeholderData: keepPreviousData,
  })
}

interface RegisterDeviceBody {
  fcmToken: string
  platform: "web"
  appVersion?: string
  mutedTypes?: string[]
}

export function registerDevice(body: RegisterDeviceBody): Promise<void> {
  return api.post<void>("/shop/v1/devices", body)
}

export function unregisterDevice(fcmToken: string): Promise<void> {
  return api.delete<void>(`/shop/v1/devices/${encodeURIComponent(fcmToken)}`)
}

export function useSetMutedTypes() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (v: { fcmToken: string; mutedTypes: string[] }) =>
      api.patch<void>("/shop/v1/notification-preferences", v),
    onSuccess: () => void qc.invalidateQueries({ queryKey: PREFS_KEY }),
  })
}

/**
 * Record that this operator opened one of their notifications (109). "not-yours" covers someone else's, another
 * audience's and a malformed id alike; "unreachable" is anything else (offline, a server error).
 */
export async function markNotificationRead(notificationId: string): Promise<"read" | "not-yours" | "unreachable"> {
  try {
    await api.post<NotificationReadResponseDTO>(`/shop/v1/notifications/${encodeURIComponent(notificationId)}/read`)
    return "read"
  } catch (err) {
    if (isDomainError(err) && (err.status === 404 || err.status === 400)) return "not-yours"
    return "unreachable"
  }
}
