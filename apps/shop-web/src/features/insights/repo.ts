import type { InsightsRange, ShopInsightsDTO } from "@effy/shared-types"

import { api } from "@/lib/api"

export async function getInsights(range: InsightsRange): Promise<ShopInsightsDTO> {
  return api.get<ShopInsightsDTO>(`/shop/v1/insights?range=${range}`)
}
