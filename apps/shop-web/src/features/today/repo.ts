import type { ShopTodayDTO } from "@effy/shared-types"

import { api } from "@/lib/api"

export async function getToday(): Promise<ShopTodayDTO> {
  return api.get<ShopTodayDTO>("/shop/v1/today")
}
