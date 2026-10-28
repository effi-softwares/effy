import { useState } from "react"

import { useQuery } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"

import type { CourierView, HandoverRowDTO } from "@effy/shared-types"
import { CircleAlert, CircleCheck, Clock, Forward, PackageOpen, Settings2, Store, Truck, Warehouse } from "lucide-react"

import { Button, Skeleton, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@effy/design-system/ui"
import { ErrorState } from "@effy/web-kit/console"

import { EmptyState, PageHeader, StatusWord, Toolbar, ViewSelect } from "@effy/web-kit/patterns"

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
      <Toolbar>
        <ViewSelect
          label="Courier stages"
          value={view}
          onChange={setView}
          options={VIEWS.map((v) => ({ value: v.value, label: v.label }))}
        />
      </Toolbar>
      {isError ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : isPending ? (
        <div className="overflow-hidden rounded-xl border bg-card p-4" aria-busy="true">
          <Skeleton className="mb-3 h-10" />
          <Skeleton className="mb-3 h-10" />
          <Skeleton className="h-10" />
        </div>
      ) : data.length === 0 ? (
        <EmptyState icon={Truck} title={current.empty} />
      ) : (
        <div className="overflow-hidden rounded-xl border bg-card">
          <div className="min-w-0">
            <Table className="ef-rtable">
              <TableHeader>
                <TableRow>
                  <TableHead>Order</TableHead>
                  <TableHead>Courier service</TableHead>
                  <TableHead>Due</TableHead>
                  <TableHead>Where it is</TableHead>
                  <TableHead>
                    <span className="sr-only">Late</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((r) => (
                  <TableRow key={r.fulfillmentId}>
                    <TableCell data-m="primary">
                      <Link to="/orders/$orderId" params={{ orderId: r.orderId }} className="link font-mono">
                        {r.orderNumber}
                      </Link>
                    </TableCell>
                    <TableCell data-m="meta">
                      {r.service ?? <span className="text-muted-foreground">Not set</span>}
                    </TableCell>
                    <TableCell data-m="meta" data-label="Due" className="whitespace-nowrap">
                      {dueText(r)}
                    </TableCell>
                    <TableCell data-m="badge">{whereWord(r)}</TableCell>
                    <TableCell data-m="meta">
                      {r.atRisk ? (
                        <span className="late">
                          <Clock aria-hidden="true" />
                          Late
                        </span>
                      ) : null}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t px-4 py-3 text-sm text-muted-foreground">
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
