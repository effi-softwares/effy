import type { InsightsRange, ShopInsightsDTO } from "@effy/shared-types"

import { api } from "@/lib/api"

// The data layer for Insights (058). No shop identifier on the wire — scope is the operator's record.
export async function getInsights(range: InsightsRange): Promise<ShopInsightsDTO> {
  return api.get<ShopInsightsDTO>(`/shop/v1/insights?range=${range}`)
}
