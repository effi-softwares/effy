import { Link } from "@tanstack/react-router"

import type { ShopBacklogDTO, ShopInsightsDTO } from "@effy/shared-types"

import { track } from "@/lib/telemetry"

import { money } from "./model"

/**
 * The drill-through strip.
 *
 * Three of the design's five cells are not built, and they are not omissions. `Conversion rate`
 * needs a storefront this shop does not have — customers buy from Effy, and a hidden fulfilment node
 * has no funnel of its own. `New customers` is customer-relationship data a shop is never shown.
 * `Returns open` needs a returns model the platform does not have. Each would have to
 * be invented to be displayed, and an invented number on an operator's screen is worse than a
 * missing one. Their slots carry figures the platform can stand behind instead.
 *
 * Every cell goes somewhere. A number that names a problem without taking you to it makes the
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
    <div className="sh-kpis">
      {cells.map((c) => (
        <Link
          key={c.label}
          to={c.to}
          search={c.search}
          className="sh-kpi"
          onClick={() => track({ name: "insights_drilled", metric: c.label })}
        >
          <span className="sh-kpi__label">{c.label}</span>
          <span className="text-lg font-semibold tabular-nums">{c.value}</span>
          <span className="sh-kpi__sub">{c.note}</span>
        </Link>
      ))}
    </div>
  )
}
