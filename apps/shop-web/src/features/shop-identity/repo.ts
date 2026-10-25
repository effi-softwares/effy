import { toShopRoles, type ShopStaffRecord, type ShopStaffRecordDTO } from "@effy/shared-types"

import { api } from "@/lib/api"

export async function loadMe(): Promise<ShopStaffRecord> {
  const dto = await api.get<ShopStaffRecordDTO>("/shop/v1/me")
  return {
    subject: dto.subject,
    email: dto.email,
    roles: toShopRoles(dto.roles),
    status: dto.status,
    shop: dto.shop,
  }
}
