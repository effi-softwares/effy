import type { HousekeepingDTO, HousekeepingSettingsUpdate } from "@effy/shared-types"

import { api } from "@/lib/api"

/** The clean-ups and the abandon time (113), in the orders service on the staff gateway. */
export function getHousekeeping(): Promise<HousekeepingDTO> {
  return api.get<HousekeepingDTO>("/orders/v1/housekeeping")
}

export function updateHousekeepingSettings(body: HousekeepingSettingsUpdate): Promise<HousekeepingDTO> {
  return api.put<HousekeepingDTO>("/orders/v1/housekeeping/settings", body)
}
