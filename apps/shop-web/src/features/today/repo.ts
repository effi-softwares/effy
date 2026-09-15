import type { ShopTeamActivityDTO, ShopTodayDTO } from "@effy/shared-types"

import { api } from "@/lib/api"

// The data layer for Today (058). The only file in this slice that touches transport — screens read
// through `queries.ts` (Principle VI).
//
// NOTHING here sends a shop identifier: the caller's shop is resolved server-side from their
// `shop_staff` record, so cross-shop access is unrepresentable on the wire.
export async function getToday(): Promise<ShopTodayDTO> {
  return api.get<ShopTodayDTO>("/shop/v1/today")
}

/** Team activity (US5) — read only when the sheet is opened; nobody needs it on page load. */
export async function getTeamActivity(): Promise<ShopTeamActivityDTO> {
  return api.get<ShopTeamActivityDTO>("/shop/v1/team-activity")
}
