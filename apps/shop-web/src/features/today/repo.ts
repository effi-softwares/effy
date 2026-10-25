import type { ShopTeamActivityDTO, ShopTodayDTO } from "@effy/shared-types"

import { api } from "@/lib/api"

export async function getToday(): Promise<ShopTodayDTO> {
  return api.get<ShopTodayDTO>("/shop/v1/today")
}

export async function getTeamActivity(): Promise<ShopTeamActivityDTO> {
  return api.get<ShopTeamActivityDTO>("/shop/v1/team-activity")
}
