import { Link } from "@tanstack/react-router"

import type { ShopBacklogDTO, ShopInsightsDTO } from "@effy/shared-types"

import { track } from "@/lib/telemetry"

import { money } from "./model"

export function SecondaryStrip({ dto, backlog }: { dto: ShopInsightsDTO; backlog: ShopBacklogDTO | undefined }) {
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
    <div className="kpis">
      {cells.map((c) => (
        <Link
          key={c.label}
          to={c.to}
          search={c.search}
          className="kpi"
          onClick={() => track({ name: "insights_drilled", metric: c.label })}
        >
          <span className="kpi__label">{c.label}</span>
          <span className="text-lg font-semibold tabular-nums">{c.value}</span>
          <span className="kpi__sub">{c.note}</span>
        </Link>
      ))}
    </div>
  )
}
