import { useQuery } from "@tanstack/react-query"
import { Link, useSearch } from "@tanstack/react-router"
import { Coins, Users } from "lucide-react"

import type { CustomerListItemDTO } from "@effy/shared-types"
import { Avatar, AvatarFallback, Button } from "@effy/design-system/ui"
import {
  DataTable,
  DateRangeFacet,
  defineListSearch,
  Facet,
  isFiltered,
  ListPage,
  listQueryOptions,
  ResetFilters,
  SearchBox,
  searchFilter,
  useListState,
  type EffyColumnDef,
} from "@effy/web-kit/data-table"
import { ActivityButton, ActivityLogDrawer } from "@effy/web-kit/activity-log"
import { PageHeader } from "@effy/web-kit/patterns"
import { initialsOf } from "@/components/shell/identity"
import { api } from "@/lib/api"
import { moment } from "@/lib/format"

import { PointsSettingsPanel } from "./components/PointsSettingsPanel"
import { formatPoints } from "./components/points-format"
import { fetchCustomerPage } from "./repo"

export function CustomersScreen() {
  const { tab } = useSearch({ strict: false }) as { tab?: string }
  return tab === "settings" ? <PointsSettingsPage /> : <CustomerList />
}

/** Customers' view in the address (103), mirroring the orders service's `CUSTOMER_LIST_SPEC`. */
export const customersList = defineListSearch({
  id: "customers",
  mode: "offset",
  sorts: ["joined", "lastOrder", "orders", "email"] as const,
  defaultSort: "joined",
  sortDir: { joined: "desc", lastOrder: "desc", orders: "desc", email: "asc" },
  filters: { hasOrdered: searchFilter.bool, joinedFrom: searchFilter.day, joinedTo: searchFilter.day },
})

const columns: EffyColumnDef<CustomerListItemDTO>[] = [
  {
    id: "customer",
    header: "Customer",
    cell: ({ row }) => (
      <span className="flex items-center gap-3">
        <Avatar aria-hidden="true" className="max-md:hidden">
          <AvatarFallback>{initialsOf(row.original.name || row.original.email)}</AvatarFallback>
        </Avatar>
        <span className="min-w-0">
          <span className="block">{row.original.name || "No name given"}</span>
          {row.original.phone ? (
            <span className="block text-sm font-normal text-muted-foreground">{row.original.phone}</span>
          ) : null}
        </span>
      </span>
    ),
    meta: { label: "Customer", identifying: true, phone: "primary" },
  },
  { id: "email", header: "Email", cell: ({ row }) => row.original.email, meta: { label: "Email", sortKey: "email" } },
  {
    id: "joined",
    header: "Joined",
    cell: ({ row }) => <span className="text-muted-foreground">{moment(row.original.joinedAt)}</span>,
    meta: { label: "Joined", priority: 2, sortKey: "joined" },
  },
  {
    id: "orders",
    header: "Orders",
    cell: ({ row }) => row.original.orderCount,
    meta: { label: "Orders", align: "numeric", sortKey: "orders", phone: "trail" },
  },
  {
    id: "lastOrder",
    header: "Last order",
    cell: ({ row }) => (
      <span className="text-muted-foreground">{row.original.lastOrderAt ? moment(row.original.lastOrderAt) : "—"}</span>
    ),
    meta: { label: "Last order", priority: 2, sortKey: "lastOrder" },
  },
  {
    id: "points",
    header: "Points",
    cell: ({ row }) => formatPoints(Number(row.original.points)),
    meta: { label: "Points", align: "numeric", priority: 2 },
  },
]

function CustomerList() {
  const search = useSearch({ strict: false }) as Record<string, unknown>
  const state = useListState(customersList, search)
  const f = state.view.filters
  const input = { key: ["customers"] as const, list: customersList, view: state.view, fetch: fetchCustomerPage }
  const query = useQuery(listQueryOptions(input))

  return (
    <ListPage
      header={
        <PageHeader
          title="Customers"
          description="Everyone with an Effy account: find one by name, email, phone or an order number, then view and adjust their points."
          actions={
            <Button variant="outline" asChild>
              <Link to="/customers" search={{ tab: "settings" }}>
                <Coins aria-hidden="true" />
                Points settings
              </Link>
            </Button>
          }
        />
      }
    >
      <DataTable
        app="back-office"
        label="Customers"
        list={customersList}
        state={state}
        columns={columns}
        query={query}
        queryInput={input}
        rowHref={(c) => ({ to: "/customers/$customerId", params: { customerId: c.id } })}
        empty={{ icon: Users, title: "No customers yet", description: "Customers appear here as they sign up." }}
        toolbar={
          <>
            <Facet
              label="Has ordered"
              value={f.hasOrdered === undefined ? null : f.hasOrdered ? "yes" : "no"}
              onChange={(v) => state.setFilter("hasOrdered", v === null ? undefined : v === "yes")}
              options={[
                { value: "yes" as const, label: "Has ordered" },
                { value: "no" as const, label: "Never ordered" },
              ]}
            />
            <DateRangeFacet
              label="Joined"
              from={f.joinedFrom}
              to={f.joinedTo}
              onChange={(r) => state.setFilters({ joinedFrom: r.from, joinedTo: r.to })}
            />
            {isFiltered(state.view) ? <ResetFilters onReset={state.reset} /> : null}
            <SearchBox
              label="Search customers"
              placeholder="Name, email, phone or order number…"
              value={state.draftQ}
              onChange={state.setQ}
            />
          </>
        }
      />
    </ListPage>
  )
}

function PointsSettingsPage() {
  return (
    <div className="flex max-w-220 flex-col gap-6">
      <PageHeader
        back={{ label: "Customers", link: { to: "/customers" } }}
        title="Points settings"
        description="How customers earn points, what they are worth, and when they expire."
        actions={<ActivityButton />}
      />
      <PointsSettingsPanel />
      <ActivityLogDrawer
        app="back-office"
        log="bo-points-settings"
        title="Rule changes"
        description="Every change to the points rules, and who made it."
        api={api}
        path="/orders/v1/points/settings/activity"
        queryKey={["customers", "points-settings"]}
        fileName="points-rules-activity"
      />
    </div>
  )
}
