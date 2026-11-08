import type { NotificationSettingsDTO, NotificationSettingsUpdate } from "@effy/shared-types"

import { api } from "@/lib/api"

/** The promotion limits (111 US3), in the orders service on the staff gateway. */
export function getNotificationSettings(): Promise<NotificationSettingsDTO> {
  return api.get<NotificationSettingsDTO>("/orders/v1/notifications/settings")
}

export function updateNotificationSettings(body: NotificationSettingsUpdate): Promise<NotificationSettingsDTO> {
  return api.put<NotificationSettingsDTO>("/orders/v1/notifications/settings", body)
}
