import type { TaxSettingsDTO } from "@effy/shared-types"

import { api } from "@/lib/api"

export function getTaxSettings(): Promise<TaxSettingsDTO> {
  return api.get<TaxSettingsDTO>("/orders/v1/admin/tax-settings")
}

export function putTaxSettings(body: Omit<TaxSettingsDTO, "unclassifiedProducts">): Promise<TaxSettingsDTO> {
  return api.put<TaxSettingsDTO>("/orders/v1/admin/tax-settings", body)
}
