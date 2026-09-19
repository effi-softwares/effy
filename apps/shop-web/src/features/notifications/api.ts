import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query"

import { api } from "@/lib/api"

/**
 * Device registration and notification preferences (059, US1/US4).
 *
 * ⚠ COLD PATH, and doctrinally so (Principle III): low-frequency operator CRUD. `POST/DELETE
 * /shop/v1/devices` are 050's routes, unchanged — 059 only widened the platform they accept. The
 * two preference routes are new and sit behind the same shop authorizer.
 */

export interface NotificationTypeInfo {
  type: string
  label: string
  group: string
  requiresRole?: string
}

export interface NotificationPreferences {
  registered: boolean
  platform: string | null
  mutedTypes: string[]
  availableTypes: NotificationTypeInfo[]
}

export const PREFS_KEY = ["shop", "notification-preferences"] as const

/**
 * Preferences for ONE registration, keyed by its token.
 *
 * ⚠ The token is part of the key, so switching devices cannot show the previous device's settings
 * from cache — which would be a screen confidently reporting another tablet's state.
 */
export function preferencesQuery(fcmToken: string | null) {
  return queryOptions({
    queryKey: [...PREFS_KEY, fcmToken ?? "none"],
    queryFn: async (): Promise<NotificationPreferences> => {
      if (!fcmToken) {
        return { registered: false, platform: null, mutedTypes: [], availableTypes: [] }
      }
      return api.get<NotificationPreferences>(
        `/shop/v1/notification-preferences?token=${encodeURIComponent(fcmToken)}`,
      )
    },
    staleTime: 30_000,
  })
}

export interface RegisterDeviceBody {
  fcmToken: string
  platform: "web"
  appVersion?: string
  /**
   * ⚠ OMIT THIS KEY to preserve what is stored. Sending `[]` CLEARS the operator's choices.
   *
   * The console re-registers on every launch; if that call carried `mutedTypes: []` it would switch
   * muted notifications back on every time the app was opened, and the operator would conclude the
   * toggle does not work. The server keys on the presence of the key, not the emptiness of the
   * value — see the device-registration contract, C4/C5.
   */
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
