import { useQuery } from "@tanstack/react-query"
import { Link, useSearch } from "@tanstack/react-router"

import { COURIER_VIEWS, type CourierView, type HandoverRowDTO } from "@effy/shared-types"
import { CircleAlert, CircleCheck, Clock, Forward, PackageOpen, Settings2, Store, Truck, Warehouse } from "lucide-react"

import { Button } from "@effy/design-system/ui"
import {
  DataTable,
  defineListSearch,
  Facet,
  ListPage,
  listQueryOptions,
  SearchBox,
  searchFilter,
  useListState,
  ViewSelect,
  type EffyColumnDef,
} from "@effy/web-kit/data-table"
import { PageHeader, StatusWord } from "@effy/web-kit/patterns"
import { courierServicesQuery } from "@/features/delivery/queries"

import { CONSIGNMENT_STATE_LABEL } from "./components/ConsignmentBlock"
import { fetchCourierPage } from "./repo"

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

/** Courier parcels' view in the address (103), mirroring the orders service's `COURIER_LIST_SPEC`. */
export const courierList = defineListSearch({
  id: "courier-parcels",
  mode: "offset",
  sorts: ["due", "order"] as const,
  defaultSort: "due",
  sortDir: { due: "asc", order: "asc" },
  filters: { view: searchFilter.oneOf(COURIER_VIEWS), service: searchFilter.text },
})

const columns: EffyColumnDef<HandoverRowDTO>[] = [
  { id: "order", header: "Order", cell: ({ row }) => row.original.orderNumber, meta: { label: "Order", identifying: true, phone: "primary", align: "mono", sortKey: "order" } },
  {
    id: "service",
    header: "Courier service",
    cell: ({ row }) => row.original.service ?? <span className="text-muted-foreground">Not set</span>,
    meta: { label: "Courier service" },
  },
  {
    id: "due",
    header: "Due",
    cell: ({ row }) => (
      <span className="flex flex-col gap-1">
        {dueText(row.original)}
        {row.original.atRisk ? (
          <span className="late">
            <Clock aria-hidden="true" />
            Late
          </span>
        ) : null}
      </span>
    ),
    meta: { label: "Due", sortKey: "due" },
  },
  { id: "where", header: "Where it is", cell: ({ row }) => whereWord(row.original), meta: { label: "Where it is", phone: "badge" } },
]

export function CourierScreen() {
  const state = useListState(courierList, useSearch({ strict: false }))
  const input = { key: ["orders", "courier"] as const, list: courierList, view: state.view, fetch: fetchCourierPage }
  const query = useQuery(listQueryOptions(input))
  const view: CourierView = state.view.filters.view ?? "hub_due"
  const current = VIEWS.find((v) => v.value === view)!
  const services = useQuery(courierServicesQuery())
  return (
    <ListPage
      header={
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
      }
    >
      <DataTable
        app="back-office"
        label="Courier parcels"
        list={courierList}
        state={state}
        columns={columns}
        query={query}
        queryInput={input}
        viewFilters={["view"]}
        rowId={(r) => r.fulfillmentId}
        rowHref={(r) => ({ to: "/orders/$orderId", params: { orderId: r.orderId } })}
        empty={{ icon: Truck, title: current.empty }}
        toolbar={
          <>
            <ViewSelect
              label="Courier stages"
              value={view}
              onChange={(v) => state.setFilter("view", v === "hub_due" ? undefined : v)}
              options={VIEWS.map((v) => ({ value: v.value, label: v.label, count: query.data?.views[v.value], attention: v.value !== "with_courier" }))}
            />
            <Facet
              label="Service"
              anyLabel="Every service"
              value={state.view.filters.service ?? null}
              onChange={(v) => state.setFilter("service", v ?? undefined)}
              options={(services.data?.items ?? []).map((s) => {
                const label = `${s.courierName} · ${s.serviceName}`
                return { value: label, label }
              })}
            />
            <SearchBox label="Search courier parcels" placeholder="Order number or service…" value={state.draftQ} onChange={state.setQ} />
          </>
        }
      />
      <p className="text-sm text-muted-foreground">Labels open through a short-lived link - never shared publicly.</p>
    </ListPage>
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
