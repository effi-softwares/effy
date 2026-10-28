import { useMutation, useQueryClient } from "@tanstack/react-query"

import { AVAILABILITY_FILTERS, type ShopAvailabilityDTO } from "@effy/shared-types"
import { defineListSearch, searchFilter } from "@effy/web-kit/data-table"

import { api } from "@/lib/api"

import { setVariantState } from "./repo"

/** Availability's view in the address (103), mirroring the shop service's `AVAILABILITY_LIST_SPEC`. */
export const availabilityList = defineListSearch({
  id: "availability",
  mode: "offset",
  sorts: ["name", "stock"] as const,
  defaultSort: "name",
  sortDir: { name: "asc", stock: "asc" },
  filters: { filter: searchFilter.oneOf(AVAILABILITY_FILTERS) },
})

/** One page of the shop's sizes for the address's view. */
export function fetchAvailabilityPage(qs: URLSearchParams, signal: AbortSignal): Promise<ShopAvailabilityDTO> {
  return api.get<ShopAvailabilityDTO>(`/shop/v1/availability?${qs}`, { signal })
}

export const AVAILABILITY_ROOT = ["shop", "stock", "availability"] as const

export function useToggleSale() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ productId, variantId, onSale }: { productId: string; variantId: string; onSale: boolean }) =>
      setVariantState(productId, variantId, { state: onSale ? "active" : "inactive" }),
    onSettled: (_data, _err, v) => {
      void queryClient.invalidateQueries({ queryKey: AVAILABILITY_ROOT })
      void queryClient.invalidateQueries({ queryKey: ["shop", "catalog", "product", v.productId] })
      void queryClient.invalidateQueries({ queryKey: ["shop", "catalog", "products"] })
    },
  })
}
