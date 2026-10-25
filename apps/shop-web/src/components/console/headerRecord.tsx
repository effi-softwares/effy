import { useQuery } from "@tanstack/react-query"
import { useLocation, useParams } from "@tanstack/react-router"

import { productDetailQuery } from "@/features/catalog/queries"
import { orderDetailQuery } from "@/features/fulfillment/queries"

/** One step of the header's trail. `to` present = a parent the operator can go back to. */
export interface Crumb {
  label: string
  to?: "/catalog" | "/orders"
  /** Identifiers (order numbers) render in the monospace face, as they do everywhere else. */
  mono?: boolean
}

/**
 * The header's trail for a path; screens with no hierarchy show just their name. Names are optional and
 * fall back to a noun ("Product"), not "Loading…": the header renders before the detail read lands and
 * stays up if it fails. Pure, so it is testable without a router.
 */
export function crumbsFor(
  pathname: string,
  names: { orderNumber?: string; productName?: string } = {},
): Crumb[] {
  if (pathname === "/orders" || pathname === "/orders/") return [{ label: "Orders" }]
  if (pathname.startsWith("/orders/")) {
    return [
      { label: "Orders", to: "/orders" },
      names.orderNumber ? { label: names.orderNumber, mono: true } : { label: "Order" },
    ]
  }
  if (pathname === "/catalog" || pathname === "/catalog/") return [{ label: "Catalog" }]
  if (pathname === "/catalog/new") {
    return [{ label: "Catalog", to: "/catalog" }, { label: "New product" }]
  }
  if (pathname === "/catalog/availability") {
    return [{ label: "Catalog", to: "/catalog" }, { label: "Availability" }]
  }
  if (pathname.startsWith("/catalog/")) {
    return [{ label: "Catalog", to: "/catalog" }, { label: names.productName ?? "Product" }]
  }
  if (pathname.startsWith("/manager")) return [{ label: "Management" }]
  return [{ label: "Today" }]
}

/**
 * The record on screen, for the last crumb of the consoles' shared header ("Shop › Orders › EFY-10023",
 * "Shop › Catalog › New product"); null on a screen with no hierarchy. The header derives section and
 * page from the nav itself.
 *
 * The names come from the same cached reads the screens make, under the same query keys, so the
 * header adds no request and cannot disagree with the page beneath it.
 */
export function useHeaderRecord(): string | null {
  const { pathname } = useLocation()
  const params = useParams({ strict: false }) as { fulfillmentId?: string; productId?: string }

  // 057 A3 — the console's order read, under the key the order screen itself uses.
  const order = useQuery({
    ...orderDetailQuery(params.fulfillmentId ?? ""),
    enabled: !!params.fulfillmentId,
  })
  const product = useQuery({
    ...productDetailQuery(params.productId ?? ""),
    enabled: !!params.productId,
  })

  const crumbs = crumbsFor(pathname, {
    orderNumber: params.fulfillmentId ? order.data?.orderNumber : undefined,
    productName: params.productId ? product.data?.name : undefined,
  })
  return crumbs.length > 1 ? crumbs[crumbs.length - 1]!.label : null
}
