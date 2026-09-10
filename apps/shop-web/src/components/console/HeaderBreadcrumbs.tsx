import { Fragment } from "react"

import { useQuery } from "@tanstack/react-query"
import { Link, useLocation, useParams, useSearch } from "@tanstack/react-router"

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbSeparator,
} from "@effy/design-system/ui"

import { productDetailQuery } from "@/features/catalog/queries"
import { orderDetailQuery } from "@/features/fulfillment/queries"
import { cn } from "@/lib/utils"

/** One step of the header's trail. `to` present = a parent the operator can go back to. */
export interface Crumb {
  label: string
  to?: "/catalog" | "/orders"
  /** Identifiers (order numbers) render in the monospace face, as they do everywhere else. */
  mono?: boolean
}

/**
 * The trail for a path (design revision 2026-09-10).
 *
 * ⚠ ONE TRAIL, IN THE HEADER, INSTEAD OF A ROW PER SCREEN. Each detail screen used to render its own
 * `Catalog / <name>` row in the page body, under a header that already said "Catalog" — the same place
 * named twice, three pixels apart. Screens with no hierarchy show just their own name.
 *
 * ⚠ THE NAMES ARE OPTIONAL, AND THE FALLBACK IS A NOUN, NOT "Loading…". The header renders before the
 * detail read lands and stays up if it fails; a trail ending in "Product" is true in both cases.
 *
 * Pure so the mapping is testable without a router.
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
  if (pathname.startsWith("/catalog/")) {
    return [{ label: "Catalog", to: "/catalog" }, { label: names.productName ?? "Product" }]
  }
  if (pathname.startsWith("/manager")) return [{ label: "Management" }]
  return [{ label: "Today" }]
}

/**
 * The header's breadcrumb. Parents are links back to their list; the final crumb is the page's
 * heading — non-interactive, in the primary foreground at a heavier weight.
 *
 * ⚠ THE NAMES COME FROM THE SAME CACHED READS THE SCREENS MAKE, under the same query keys, so the
 * header adds no request and cannot disagree with the page beneath it.
 */
export function HeaderBreadcrumbs() {
  const { pathname } = useLocation()
  const params = useParams({ strict: false }) as { fulfillmentId?: string; productId?: string }
  // ⚠ On an order, the "Orders" crumb returns to the list it was opened FROM — same tab, filters and
  // page — so going back up the trail does not throw away the operator's place.
  const search = useSearch({ strict: false }) as Record<string, unknown>

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

  return (
    <Breadcrumb>
      <BreadcrumbList className="flex-nowrap gap-2 sm:gap-2">
        {crumbs.map((c, i) => {
          const last = i === crumbs.length - 1
          return (
            <Fragment key={`${i}:${c.label}`}>
              {i > 0 ? (
                <BreadcrumbSeparator className="text-muted-foreground text-[13px]">/</BreadcrumbSeparator>
              ) : null}
              <BreadcrumbItem className="min-w-0">
                {last ? (
                  // ⚠ Not `BreadcrumbPage`: shadcn gives it role="link", so the one crumb that is
                  // deliberately NOT interactive would be announced as a (disabled) link.
                  <h1 className="min-w-0">
                    <span
                      aria-current="page"
                      className={cn(
                        "text-foreground block truncate text-sm font-semibold tracking-[-.01em]",
                        c.mono && "font-mono",
                      )}
                    >
                      {c.label}
                    </span>
                  </h1>
                ) : c.to ? (
                  <BreadcrumbLink asChild>
                    <Link
                      to={c.to}
                      search={c.to === "/orders" && params.fulfillmentId ? search : undefined}
                      className="text-muted-foreground hover:text-foreground focus-visible:ring-ring rounded-sm text-sm font-medium tracking-[-.01em] whitespace-nowrap focus-visible:ring-2 focus-visible:outline-none"
                    >
                      {c.label}
                    </Link>
                  </BreadcrumbLink>
                ) : (
                  <span className="text-muted-foreground text-sm font-medium whitespace-nowrap">
                    {c.label}
                  </span>
                )}
              </BreadcrumbItem>
            </Fragment>
          )
        })}
      </BreadcrumbList>
    </Breadcrumb>
  )
}
