import { useMemo } from "react"
import { useQuery } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import { AlertTriangle, ArrowRight } from "lucide-react"

import { ErrorState } from "@effy/web-kit/console"
import { Skeleton } from "@effy/design-system/ui"

import { lowStockQuery } from "@/features/catalog/stockQueries"
import { fulfillmentQueueQuery } from "@/features/fulfillment/queries"
import { ProvingScreen } from "@/features/shop-identity/ProvingScreen"

import { DashboardEmptyState } from "./EmptyState"
import { NeedsAttention } from "./NeedsAttention"
import { attentionFrom, countsFrom } from "./model"

/**
 * The shop console's home screen (US1).
 *
 * ⚠ THE NUMBERS ARE REAL NOW. Until 057 every figure here was an em-dash with the hint "Illustrative
 * until wired", and the chart beside them was seven days of invented data labelled "Sample data — not
 * live operations". A dashboard that shows made-up numbers to the person responsible for the real
 * ones is worse than no dashboard: it trains them not to look. Both are gone — the counts are derived
 * from the two reads the console already makes (see `model.ts`), and the sample chart was DELETED
 * rather than re-pointed, because no metric on this platform is stored over time yet and drawing a
 * trend line from data that does not exist would be the same defect wearing a different label.
 *
 * ⚠ NO METRIC CARDS AT THE TOP (Principle V / DOCTRINE-2). The counts are a compact figure strip of
 * sectioned columns, not tiles — the same treatment the order queue and restock list get.
 */
export function DashboardScreen() {
  const orders = useQuery(fulfillmentQueueQuery("active"))
  const lowStock = useQuery(lowStockQuery)

  const counts = useMemo(
    () => countsFrom(orders.data?.items ?? [], lowStock.data ?? []),
    [orders.data, lowStock.data],
  )
  const attention = useMemo(
    () => attentionFrom(orders.data?.items ?? [], lowStock.data ?? []),
    [orders.data, lowStock.data],
  )

  // ⚠ Only the ORDERS read is allowed to fail the whole screen. The restock list is supporting
  // context: losing it should not hide the queue an operator came here to check. Its own failure is
  // reported in place, in its own section.
  const loading = orders.isPending || lowStock.isPending

  return (
    <div className="flex flex-col gap-[var(--pad)]">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Today</h1>
        <p className="text-muted-foreground">
          What your shop owes right now. Updates automatically.
        </p>
      </div>

      {orders.isError ? (
        <ErrorState error={orders.error} onRetry={() => void orders.refetch()} />
      ) : (
        <>
          <CountStrip loading={loading} counts={counts} />

          <section className="space-y-3">
            <div className="flex items-center justify-between border-b pb-2">
              <h2 className="text-sm font-semibold">Needs attention</h2>
              <Link
                to="/orders"
                className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm"
              >
                All orders
                <ArrowRight className="size-3.5" />
              </Link>
            </div>

            {loading ? (
              <div className="space-y-2">
                {[0, 1, 2].map((i) => (
                  <Skeleton key={i} className="h-14 w-full" />
                ))}
              </div>
            ) : attention.length === 0 ? (
              <DashboardEmptyState />
            ) : (
              <NeedsAttention items={attention} />
            )}

            {lowStock.isError ? (
              <p className="text-muted-foreground text-sm">
                Stock levels couldn&apos;t be loaded, so this list shows orders only.
              </p>
            ) : null}
          </section>
        </>
      )}

      <ProvingScreen />
    </div>
  )
}

/**
 * The figure strip.
 *
 * ⚠ Sectioned columns divided by hairlines — NOT metric cards (Principle V / DOCTRINE-2). The one
 * emphasised figure is whatever is actually wrong: at-risk orders and out-of-stock products carry
 * weight and a glyph, everything else reads flat. Nothing here is coloured.
 */
function CountStrip({
  loading,
  counts,
}: {
  loading: boolean
  counts: ReturnType<typeof countsFrom>
}) {
  const cells = [
    { label: "To pick", value: counts.toPick, urgent: false, hint: "Waiting on someone" },
    { label: "Ready for pickup", value: counts.readyForPickup, urgent: false, hint: "Awaiting a driver" },
    {
      label: "At risk",
      value: counts.atRisk,
      urgent: counts.atRisk > 0,
      hint: "Past or near the promise",
    },
    {
      label: "Needs restocking",
      value: counts.needsRestock,
      urgent: counts.outOfStock > 0,
      hint: counts.outOfStock > 0 ? `${counts.outOfStock} out of stock` : "At or below threshold",
    },
  ]

  return (
    <dl className="divide-border grid grid-cols-2 divide-y rounded-md border sm:grid-cols-4 sm:divide-x sm:divide-y-0">
      {cells.map((c) => (
        <div key={c.label} className="px-4 py-3">
          <dt className="text-muted-foreground flex items-center gap-1.5 text-xs">
            {c.urgent ? <AlertTriangle className="size-3 shrink-0" aria-hidden="true" /> : null}
            {c.label}
          </dt>
          <dd
            className={
              c.urgent
                ? "mt-1 text-2xl font-semibold tabular-nums"
                : "mt-1 text-2xl font-normal tabular-nums"
            }
          >
            {loading ? <Skeleton className="h-8 w-10" /> : c.value}
          </dd>
          <dd className="text-muted-foreground mt-0.5 text-xs">{c.hint}</dd>
        </div>
      ))}
    </dl>
  )
}
