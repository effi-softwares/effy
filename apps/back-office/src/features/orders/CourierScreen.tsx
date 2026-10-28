import { useState } from "react"

import { useQuery } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"

import type { CourierView, HandoverRowDTO } from "@effy/shared-types"
import { CircleAlert, CircleCheck, Clock, Forward, PackageOpen, Settings2, Store, Truck, Warehouse } from "lucide-react"

import { Button, Skeleton, Tabs, TabsList, TabsTrigger } from "@effy/design-system/ui"
import { ErrorState } from "@effy/web-kit/console"

import { PageHeader, EmptyState, StatusWord } from "@effy/web-kit/patterns"

import { CONSIGNMENT_STATE_LABEL } from "./components/ConsignmentBlock"
import { courierParcelsQuery } from "./queries"

const VIEWS: { value: CourierView; label: string; empty: string }[] = [
  { value: "hub_due", label: "At the hub", empty: "No courier parcels are waiting at the hub." },
  { value: "hub_late", label: "Late at the hub", empty: "Nothing has missed its pickup." },
  { value: "supplier", label: "Supplier pickups", empty: "No pickups from suppliers are waiting." },
  { value: "with_courier", label: "With the courier", empty: "Nothing is with a courier right now." },
  { value: "problems", label: "Problems", empty: "No problems reported." },
]

const when = (iso: string) =>
  new Intl.DateTimeFormat("en-AU", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Australia/Melbourne",
  }).format(new Date(iso))

export function CourierScreen() {
  const [view, setView] = useState<CourierView>("hub_due")
  const { data, error, isPending, isError, refetch } = useQuery(courierParcelsQuery(view))
  const current = VIEWS.find((v) => v.value === view)!
  return (
    <>
      <PageHeader
        title="Courier parcels"
        description="Parcels going to customers by courier, ready to book, track and record each step."
        actions={
          <Button variant="outline" asChild>
            <Link to="/delivery" search={{ tab: "coverage" }}>
              <Settings2 aria-hidden="true" />
              Courier services
            </Link>
          </Button>
        }
      />
      <Tabs value={view} onValueChange={(v) => setView(v as CourierView)}>
        <TabsList aria-label="Courier stages">
          {VIEWS.map((v) => (
            <TabsTrigger key={v.value} value={v.value}>
              {v.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      {isError ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : isPending ? (
        <div className="ef-table-wrap p-4" aria-busy="true">
          <Skeleton className="mb-3 h-10" />
          <Skeleton className="mb-3 h-10" />
          <Skeleton className="h-10" />
        </div>
      ) : data.length === 0 ? (
        <EmptyState icon={Truck} title={current.empty} />
      ) : (
        <div className="ef-table-wrap">
          <div className="ef-table-scroll">
            <table className="ef-table ef-rtable">
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Courier service</th>
                  <th>Due</th>
                  <th>Where it is</th>
                  <th>
                    <span className="sr-only">Late</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.map((r) => (
                  <tr key={r.fulfillmentId}>
                    <td data-m="primary">
                      <Link to="/orders/$orderId" params={{ orderId: r.orderId }} className="link ef-code">
                        {r.orderNumber}
                      </Link>
                    </td>
                    <td data-m="meta">{r.service ?? <span className="text-muted-foreground">Not set</span>}</td>
                    <td data-m="meta" data-label="Due" className="whitespace-nowrap">
                      {dueText(r)}
                    </td>
                    <td data-m="badge">{whereWord(r)}</td>
                    <td data-m="meta">
                      {r.atRisk ? (
                        <span className="late">
                          <Clock aria-hidden="true" />
                          Late
                        </span>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="ef-pager">
            <span>
              {data.length} {data.length === 1 ? "parcel" : "parcels"} · {current.label}
            </span>
            <span>Labels open through a short-lived link — never shared publicly</span>
          </div>
        </div>
      )}
    </>
  )
}

function dueText(r: HandoverRowDTO) {
  if (r.pickup)
    return (
      <span className="tabular-nums">
        Pickup {r.pickup.date}
        {r.pickup.from ? `, ${r.pickup.from}–${r.pickup.to}` : ""}
      </span>
    )
  if (r.collection === "supplier") return <span className="text-muted-foreground">Pickup to arrange</span>
  return <span className="tabular-nums">{r.dueOut ? when(r.dueOut) : r.handoverDueOn}</span>
}

function whereWord(r: HandoverRowDTO) {
  if (r.consignmentState) {
    const problem = ["failed", "lost", "damaged", "returned"].includes(r.consignmentState)
    const done = r.consignmentState === "delivered"
    return (
      <StatusWord
        tone={problem ? "problem" : done ? "done" : "moving"}
        icon={problem ? CircleAlert : done ? CircleCheck : Forward}
      >
        {CONSIGNMENT_STATE_LABEL[r.consignmentState]}
      </StatusWord>
    )
  }
  if (r.collection === "supplier")
    return (
      <StatusWord tone="waiting" icon={Store}>
        At the supplier
      </StatusWord>
    )
  return r.atHub ? (
    <StatusWord tone="moving" icon={Warehouse}>
      At the hub
    </StatusWord>
  ) : (
    <StatusWord tone="muted" icon={PackageOpen}>
      Not at the hub yet
    </StatusWord>
  )
}
