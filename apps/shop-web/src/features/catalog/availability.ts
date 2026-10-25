import { keepPreviousData, queryOptions, useMutation, useQueryClient } from "@tanstack/react-query"

import type { AvailabilityFilter, ShopAvailabilityDTO } from "@effy/shared-types"

import { api } from "@/lib/api"

import { setVariantState } from "./repo"

interface AvailabilityParams {
  q?: string
  filter?: AvailabilityFilter
  after?: string
}

function encodeAvailabilityQuery(p: AvailabilityParams): string {
  const params = new URLSearchParams()
  if (p.q?.trim()) params.set("q", p.q.trim())
  if (p.filter && p.filter !== "all") params.set("filter", p.filter)
  if (p.after) params.set("after", p.after)
  return params.toString()
}

function listAvailability(p: AvailabilityParams): Promise<ShopAvailabilityDTO> {
  const qs = encodeAvailabilityQuery(p)
  return api.get<ShopAvailabilityDTO>(`/shop/v1/availability${qs ? `?${qs}` : ""}`)
}

const AVAILABILITY_ROOT = ["shop", "stock", "availability"] as const

export const availabilityQuery = (p: AvailabilityParams) =>
  queryOptions({
    queryKey: [
      ...AVAILABILITY_ROOT,
      { q: p.q?.trim() || undefined, filter: p.filter ?? "all", after: p.after },
    ] as const,
    queryFn: () => listAvailability(p),
    placeholderData: keepPreviousData,
  })

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
