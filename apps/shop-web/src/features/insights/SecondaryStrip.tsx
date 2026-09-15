import { Link } from "@tanstack/react-router"

import type { ShopBacklogDTO, ShopInsightsDTO } from "@effy/shared-types"

import { track } from "@/lib/telemetry"

import { money } from "./model"

/**
 * The drill-through strip (058, FR-018/FR-034).
 *
 * ⚠ THREE OF THE DESIGN'S FIVE CELLS ARE NOT BUILT, and they are not omissions. `Conversion rate`
 * needs a storefront this shop does not have — customers buy from Effy, and a hidden fulfilment node
 * has no funnel of its own. `New customers` is customer-relationship data a shop is never shown
 * (023 FR-018). `Returns open` needs a returns model the platform does not have. Each would have to
 * be invented to be displayed, and an invented number on an operator's screen is worse than a
 * missing one. Their slots carry figures the platform can stand behind instead.
 *
 * ⚠ EVERY CELL GOES SOMEWHERE. A number that names a problem without taking you to it makes the
 * reader do a search; each of these opens the already-filtered list that explains it.
 */
export function SecondaryStrip({
  dto,
  backlog,
}: {
  dto: ShopInsightsDTO
  backlog: ShopBacklogDTO | undefined
}) {
  const cells: Array<{
    label: string
    value: string
    note: string
    to: string
    search?: Record<string, string>
  }> = [
    {
      label: "Refunds",
      value: money(dto.secondary.refunds.value, dto.currency),
      note: `${dto.secondary.refunds.orders} ${dto.secondary.refunds.orders === 1 ? "order" : "orders"}`,
      to: "/orders",
      search: { payment: "refunded" },
    },
    {
      label: "Can't supply",
      value: dto.secondary.cantSupply.value,
      note: `${dto.secondary.cantSupply.units} units`,
      to: "/orders",
      search: { tab: "unfulfillable" },
    },
    {
      label: "Low stock SKUs",
      value: backlog ? String(backlog.lowStock.skus) : "—",
      note: backlog ? `${backlog.lowStock.outOfStock} out of stock` : "",
      to: "/catalog",
      search: { stock: "low" },
    },
    {
      label: "Cancelled",
      value: dto.secondary.cancelled.value,
      note: "Withdrawn portions",
      to: "/orders",
      search: { tab: "withdrawn" },
    },
    {
      label: "Ready for pickup",
      value: backlog ? String(backlog.readyForPickup) : "—",
      note: "Waiting for a driver",
      to: "/orders",
      search: { tab: "ready_for_pickup" },
    },
  ]

  return (
    // Rules as a grid gap — see MetricStrip: a wrapped row must not draw one against the container edge.
    <div className="bg-border grid grid-cols-2 gap-px overflow-hidden rounded-[var(--radius)] border sm:grid-cols-5">
      {cells.map((c) => (
        <Link
          key={c.label}
          to={c.to}
          search={c.search}
          className="bg-background hover:bg-accent grid gap-[3px] px-4 py-3 text-left no-underline"
          onClick={() => track({ name: "insights_drilled", metric: c.label })}
        >
          <span className="text-muted-foreground truncate text-xs">{c.label}</span>
          <span className="flex items-baseline gap-[7px]">
            <span className="text-base font-semibold tabular-nums">{c.value}</span>
            <span className="text-muted-foreground truncate text-[11.5px]">{c.note}</span>
          </span>
        </Link>
      ))}
    </div>
  )
}
