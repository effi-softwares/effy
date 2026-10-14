import "server-only"

import { cache } from "react"
import type { AddressDTO, OrderSummaryDTO, PointsBalanceDTO, SavedItemDTO } from "@effy/shared-types"

import { edgeApi, perCustomer } from "@/lib/api/edge"
import { getSession } from "@/lib/session"

/**
 * The signed-in customer's own reads, each made at most ONCE per request however many islands show
 * it (PERF-16).
 *
 * A signed-in page asks for the same things from several places at once — points from the header's
 * account menu, the home shortcuts and the product page's delivery note; addresses from the delivery
 * bar and that note. Next's fetch memoization would probably collapse them, but only while every call
 * site keeps a byte-identical request; React's `cache()` makes it one request by construction (the
 * same reasoning as `getHome`).
 *
 * ⚠ PER CUSTOMER, AND PER REQUEST ONLY. `cache()` lives for one server render, so nothing here is
 * shared between requests or customers — never move these behind `"use cache"`.
 *
 * Each returns null for a guest (no request is made) and THROWS when the read fails, so every caller
 * keeps deciding what a failure looks like where it is shown.
 */
function perRequest<T>(path: string): () => Promise<T | null> {
  return cache(async () => {
    const session = await getSession()
    return session ? edgeApi(session).get<T>(path, perCustomer) : null
  })
}

export const getPoints = perRequest<PointsBalanceDTO>("/customer/v1/points")
export const getAddresses = perRequest<AddressDTO[]>("/customer/v1/addresses")
export const getSavedItems = perRequest<SavedItemDTO[]>("/commerce/v1/saved")
export const getOrders = perRequest<OrderSummaryDTO[]>("/commerce/v1/orders")

/** The address a customer delivers to by default: the one marked so, else their first. */
export function defaultAddress(addresses: readonly AddressDTO[] | null | undefined): AddressDTO | null {
  return addresses?.find((a) => a.isDefault) ?? addresses?.[0] ?? null
}
