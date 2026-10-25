import { useQuery } from "@tanstack/react-query"
import { useLocation, useParams } from "@tanstack/react-router"

import { productDetailQuery } from "@/features/catalog/queries"
import { orderDetailQuery } from "@/features/fulfillment/queries"

interface Crumb {
  label: string
  to?: "/catalog" | "/orders"
  mono?: boolean
}

export function crumbsFor(pathname: string, names: { orderNumber?: string; productName?: string } = {}): Crumb[] {
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

export function useHeaderRecord(): string | null {
  const { pathname } = useLocation()
  const params = useParams({ strict: false }) as { fulfillmentId?: string; productId?: string }

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
