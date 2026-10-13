import type { Metadata } from "next"
import Link from "next/link"
import { Suspense } from "react"

import { DELIVERY_TYPE_WORDS, type OrderSummaryDTO } from "@effy/shared-types"

import { edgeApi, uncached } from "@/lib/api/edge"
import { getSession, requireCustomer } from "@/lib/dal"
import { formatMoney } from "@/lib/money"
import { LiveRefresh } from "@/components/live/LiveRefresh"
import { ChevronLeft, ChevronRight, Package } from "lucide-react"

import { btnClass } from "@/components/storefront/actions"
import { EmptyState } from "@/components/storefront/kit"
import { Badge } from "@/components/ui/badge"
import { Breadcrumb } from "@/components/ui/misc"

import { inPeriod, matchesFilter, ORDER_FILTERS, orderRowWords, periodsFor, type OrderFilter } from "@/lib/order-summary"
import { cn } from "@/lib/utils"

import { PeriodSelect } from "./PeriodSelect"
import { ReorderButton } from "./ReorderButton"

export const metadata: Metadata = {
  title: "Your orders",
  robots: { index: false, follow: false },
}

/** Order history (US5). Most-recent-first; each row opens the full receipt. Gated + request-time → Suspense. */
type Search = Promise<{ status?: string; period?: string; page?: string }>

/**
 * The order history (reference: Orders · Order history).
 *
 * The filters, the period and the page are all in the URL, so a filtered list can be bookmarked and
 * the back button undoes one choice at a time. The list itself is one read; filtering it is ours.
 */
export default function OrdersPage({ searchParams }: { searchParams: Search }) {
  return (
    <div className="space-y-6">
      <Breadcrumb items={[{ label: "Account", href: "/account" }, { label: "Orders" }]} />
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Your orders</h1>
        <p className="text-sm text-muted-foreground">Track deliveries, get receipts and buy things again.</p>
      </div>
      <LiveRefresh />
      <Suspense fallback={<ListSkeleton />}>
        <OrdersList searchParams={searchParams} />
      </Suspense>
    </div>
  )
}

const PLACED = new Intl.DateTimeFormat("en-AU", { day: "numeric", month: "short", year: "numeric", timeZone: "Australia/Melbourne" })
const PAGE_SIZE = 10

async function OrdersList({ searchParams }: { searchParams: Search }) {
  await requireCustomer("/orders")
  const session = await getSession()
  const params = await searchParams

  let orders: OrderSummaryDTO[] = []
  if (session?.accessToken) {
    try {
      orders = await edgeApi(session).get<OrderSummaryDTO[]>("/commerce/v1/orders", uncached())
    } catch {
      orders = []
    }
  }

  if (orders.length === 0) {
    return (
      <EmptyState
        icon={Package}
        className="py-16"
        title="No orders yet"
        description="When you place an order it will appear here, and you can follow it to your door."
        action={{ label: "Start shopping", href: "/" }}
      />
    )
  }

  const filter: OrderFilter = ORDER_FILTERS.some((f) => f.key === params.status) ? (params.status as OrderFilter) : "all"
  const periods = periodsFor(orders)
  const period = periods.some((p) => p.key === params.period) ? params.period! : "recent"

  const now = new Date()
  const shown = orders.filter((o) => inPeriod(o, period, now) && matchesFilter(o, filter))
  const pages = Math.max(1, Math.ceil(shown.length / PAGE_SIZE))
  const page = Math.min(pages, Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1))
  const rows = shown.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  /** A link to this list with one thing changed. The defaults leave the URL clean. */
  const href = (next: { status?: string; period?: string; page?: number }) => {
    const q = new URLSearchParams()
    const status = next.status ?? filter
    const p = next.period ?? period
    if (status !== "all") q.set("status", status)
    if (p !== "recent") q.set("period", p)
    if (next.page && next.page > 1) q.set("page", String(next.page))
    const qs = q.toString()
    return qs ? `/orders?${qs}` : "/orders"
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Filter orders" className="inline-flex max-w-full gap-1 overflow-x-auto rounded-lg bg-muted p-1 [scrollbar-width:none]">
          {ORDER_FILTERS.map((f) => (
            <Link
              key={f.key}
              href={href({ status: f.key })}
              aria-current={f.key === filter ? "page" : undefined}
              className={cn(
                "inline-flex h-7 shrink-0 items-center rounded-md px-3 text-sm font-medium whitespace-nowrap text-muted-foreground hover:text-foreground",
                "aria-[current=page]:bg-background aria-[current=page]:text-foreground aria-[current=page]:shadow-xs",
              )}
            >
              {f.label}
            </Link>
          ))}
        </nav>
        <PeriodSelect
          value={period}
          periods={periods}
          hrefs={Object.fromEntries(periods.map((p) => [p.key, href({ period: p.key })]))}
        />
      </div>

      {rows.length === 0 ? (
        // ⚠ NOT the "No orders yet" state: this customer has orders, just none here — and a filter
        // that silently shows nothing reads as the history having been lost.
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed px-6 py-12 text-center">
          <h2 className="text-lg font-semibold">No orders match</h2>
          <p className="max-w-md text-sm text-muted-foreground">
            You have {orders.length === 1 ? "1 order" : `${orders.length} orders`} in all — none in this period with this filter.
          </p>
          <Link href={href({ status: "all", period: "all" })} className={btnClass("outline", "md", "mt-2")}>
            Show all orders
          </Link>
        </div>
      ) : (
        rows.map((o) => <OrderRow key={o.id} order={o} now={now} />)
      )}

      {pages > 1 && (
        <nav aria-label="Pages" className="flex flex-wrap items-center justify-center gap-1 pt-2">
          <PageLink href={href({ page: page - 1 })} disabled={page === 1}>
            <ChevronLeft aria-hidden="true" />
            Previous
          </PageLink>
          {Array.from({ length: pages }, (_, i) => i + 1).map((n) => (
            <Link
              key={n}
              href={href({ page: n })}
              aria-current={n === page ? "page" : undefined}
              aria-label={`Page ${n}`}
              className={btnClass(n === page ? "outline" : "ghost", "md", "w-9 px-0")}
            >
              {n}
            </Link>
          ))}
          <PageLink href={href({ page: page + 1 })} disabled={page === pages}>
            Next
            <ChevronRight aria-hidden="true" />
          </PageLink>
        </nav>
      )}
    </div>
  )
}

function PageLink({ href, disabled, children }: { href: string; disabled: boolean; children: React.ReactNode }) {
  if (disabled) {
    return (
      <span aria-disabled="true" className={btnClass("ghost", "md", "opacity-50")}>
        {children}
      </span>
    )
  }
  return (
    <Link href={href} className={btnClass("ghost", "md")}>
      {children}
    </Link>
  )
}

const TONE = { outline: "outline", default: "default", brand: "brand", secondary: "secondary" } as const

function OrderRow({ order: o, now }: { order: OrderSummaryDTO; now: Date }) {
  const words = orderRowWords(o, now)
  // Three pictures, as the reference shows; a fourth from the server only tells us there is more.
  const pictures = (o.thumbnails ?? []).slice(0, 3)
  const more = (o.thumbnails?.length ?? 0) > pictures.length
  const items = `${o.itemCount} item${o.itemCount === 1 ? "" : "s"}`

  return (
    <article className="rounded-lg border bg-card shadow-xs">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-4 text-sm sm:px-6">
        <dl className="flex flex-wrap gap-x-6 gap-y-2">
          <Fact label="Order">{o.orderNumber}</Fact>
          {o.placedAt && <Fact label="Placed">{PLACED.format(new Date(o.placedAt))}</Fact>}
          <Fact label="Total" className="tabular-nums">
            {formatMoney(o.grandTotalAmount, o.currency)}
          </Fact>
          {o.delivery && (
            <Fact label="Delivery" className="max-md:hidden">
              {o.delivery.type === "courier" ? DELIVERY_TYPE_WORDS.courier : DELIVERY_TYPE_WORDS.effy}
            </Fact>
          )}
        </dl>
        <Badge variant={TONE[words.tone]}>{words.badge}</Badge>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-6">
        <div className="min-w-0 space-y-3">
          {words.line && <p className="font-medium">{words.line}</p>}
          <div className="flex items-center gap-2">
            {pictures.map((src, i) => (
              <span key={i} aria-hidden="true" className="grid size-14 shrink-0 place-items-center overflow-hidden rounded-md bg-secondary text-muted-foreground">
                {src ? <img src={src} alt="" className="size-full object-cover" /> : <Package className="size-6" />}
              </span>
            ))}
            <span className="text-sm text-muted-foreground">
              {more ? `and more · ${items}` : items}
            </span>
          </div>
        </div>
        <div className="flex flex-wrap items-start gap-2">
          <Link href={`/orders/${o.id}`} className={btnClass(words.inProgress ? "primary" : "outline", "md")}>
            {o.stage === "on_the_way" ? "Track order" : "View order"}
            <span className="sr-only"> {o.orderNumber}</span>
          </Link>
          {o.status === "paid" && <ReorderButton orderId={o.id} />}
        </div>
      </div>
    </article>
  )
}

function Fact({ label, className, children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={className}>
      <dt className="text-xs font-normal text-muted-foreground">{label}</dt>
      <dd className="font-medium">{children}</dd>
    </div>
  )
}

function ListSkeleton() {
  return (
    <div className="space-y-4" aria-hidden="true">
      <div className="h-9 w-full max-w-md animate-pulse rounded-lg bg-muted" />
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-40 w-full animate-pulse rounded-lg bg-muted" />
      ))}
    </div>
  )
}
