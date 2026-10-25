import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query"

import { api } from "@/lib/api"

interface NotificationTypeInfo {
  type: string
  label: string
  group: string
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
    queryFn: async (): Promise<NotificationPreferences> => {
      if (!fcmToken) {
        return { registered: false, platform: null, mutedTypes: [], availableTypes: [] }
      }
      return api.get<NotificationPreferences>(`/shop/v1/notification-preferences?token=${encodeURIComponent(fcmToken)}`)
    },
    staleTime: 30_000,
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
