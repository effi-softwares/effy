import { keepPreviousData, queryOptions, useMutation, useQueryClient } from "@tanstack/react-query"

import type { AvailabilityFilter, ShopAvailabilityDTO } from "@effy/shared-types"

import { api } from "@/lib/api"

import { setVariantState } from "./repo"

/**
 * Availability (099): every size the shop sells, its stock and whether it is on sale. Read through the
 * shop service; the switch is the product page's own route (immediate, never reviewed).
 *
 * Keyed under `["shop", "stock"]` so the live channel's `stock` kind — sent when a size goes on or off
 * sale or its count changes, here or anywhere — re-reads it. Never on a timer.
 */
export interface AvailabilityParams {
  q?: string
  filter?: AvailabilityFilter
  /** The page's offset cursor; absent for the first page. */
  after?: string
}

export function encodeAvailabilityQuery(p: AvailabilityParams): string {
  const params = new URLSearchParams()
  if (p.q?.trim()) params.set("q", p.q.trim())
  if (p.filter && p.filter !== "all") params.set("filter", p.filter)
  if (p.after) params.set("after", p.after)
  return params.toString()
}

export function listAvailability(p: AvailabilityParams): Promise<ShopAvailabilityDTO> {
  const qs = encodeAvailabilityQuery(p)
  return api.get<ShopAvailabilityDTO>(`/shop/v1/availability${qs ? `?${qs}` : ""}`)
}

const AVAILABILITY_ROOT = ["shop", "stock", "availability"] as const

export const availabilityQuery = (p: AvailabilityParams) =>
  queryOptions({
    queryKey: [...AVAILABILITY_ROOT, { q: p.q?.trim() || undefined, filter: p.filter ?? "all", after: p.after }] as const,
    queryFn: () => listAvailability(p),
    placeholderData: keepPreviousData,
  })

/** One size on or off sale, from the Availability list. The product's own screens re-read too. */
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
