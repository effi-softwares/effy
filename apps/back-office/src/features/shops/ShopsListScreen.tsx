import { useState } from "react"

import { useQuery } from "@tanstack/react-query"
import { useSearch } from "@tanstack/react-router"
import { Plus, Store } from "lucide-react"

import { Button } from "@effy/design-system/ui"
import {
  DataTable,
  ListPage,
  listQueryOptions,
  SearchBox,
  useListState,
  viewsQueryOptions,
  ViewSelect,
  type EffyColumnDef,
} from "@effy/web-kit/data-table"
import { PageHeader } from "@effy/web-kit/patterns"
import { sessionQuery } from "@/features/auth/queries"

import { canManageShops } from "./access"
import { CreateShopDialog } from "./components/CreateShopDialog"
import { ShopStatusBadge } from "./components/StatusBadge"
import { SHOP_STATUSES, SHOPS_LIST_KEY, shopsList, type ShopView } from "./list"
import type { ShopListItem } from "./model"
import { fetchShopPage, fetchShopViews } from "./repo"

const VIEW_LABEL: Record<ShopView, string> = {
  all: "All shops",
  active: "Active",
  suspended: "Suspended",
  disabled: "Disabled",
}

const columns: EffyColumnDef<ShopListItem>[] = [
  {
    id: "code",
    header: "Code",
    cell: ({ row }) => row.original.code,
    meta: { label: "Code", identifying: true, phone: "primary", align: "mono", sortKey: "code" },
  },
  {
    id: "name",
    header: "Name",
    cell: ({ row }) => row.original.name,
    meta: { label: "Name", phone: "meta", sortKey: "name" },
  },
  {
    id: "address",
    header: "Address",
    cell: ({ row }) =>
      row.original.hasAddress ? (
        <span className="text-muted-foreground">Recorded</span>
      ) : (
        <span className="font-medium">Not recorded</span>
      ),
    meta: { label: "Address", priority: 2 },
  },
  {
    id: "status",
    header: "Status",
    cell: ({ row }) => <ShopStatusBadge status={row.original.status} />,
    meta: { label: "Status", phone: "badge" },
  },
  {
    id: "users",
    header: "Users",
    cell: ({ row }) => row.original.userCount,
    meta: { label: "Users", align: "numeric", priority: 2 },
  },
  {
    id: "scanning",
    header: "Label scanning",
    cell: ({ row }) => <ScanRate scanning={row.original.labelScanning} />,
    meta: { label: "Label scanning", priority: 3, phone: "hide" },
  },
]

export function ShopsListScreen() {
  const { data: session } = useQuery(sessionQuery)
  const roles = session?.status === "signed-in" ? session.identity.roles : []
  const canManage = canManageShops(roles)
  const [createOpen, setCreateOpen] = useState(false)

  const state = useListState(shopsList, useSearch({ strict: false }))
  const input = { key: SHOPS_LIST_KEY, list: shopsList, view: state.view, fetch: fetchShopPage }
  const query = useQuery(listQueryOptions(input))
  const views = useQuery(
    viewsQueryOptions({ key: SHOPS_LIST_KEY, list: shopsList, view: state.view, except: ["status"], fetch: fetchShopViews }),
  )
  const view: ShopView = state.view.filters.status ?? "all"

  return (
    <ListPage
      header={
        <PageHeader
          title="Shops"
          description="The fulfilment shops that pack Effy orders, and the operators who run them."
          actions={
            canManage ? (
              <Button onClick={() => setCreateOpen(true)}>
                <Plus aria-hidden="true" />
                Create shop
              </Button>
            ) : undefined
          }
        />
      }
    >
      <DataTable
        app="back-office"
        label="Shops"
        list={shopsList}
        state={state}
        columns={columns}
        query={query}
        queryInput={input}
        viewFilters={["status"]}
        rowHref={(s) => ({ to: "/shops/$shopId", params: { shopId: s.id } })}
        empty={{ icon: Store, title: "No shops yet", description: "Create the first shop to give its operators a sign-in." }}
        toolbar={
          <>
            <ViewSelect
              label="Shop views"
              value={view}
              onChange={(v) => state.setFilter("status", v === "all" ? undefined : v)}
              options={(["all", ...SHOP_STATUSES] as const).map((v) => ({
                value: v,
                label: VIEW_LABEL[v],
                count: views.data?.views[v],
              }))}
            />
            <SearchBox label="Search shops" placeholder="Search by code or name…" value={state.draftQ} onChange={state.setQ} />
          </>
        }
      />
      {canManage ? <CreateShopDialog open={createOpen} onOpenChange={setCreateOpen} /> : null}
    </ListPage>
  )
}

function ScanRate({ scanning }: { scanning?: { scanned: number; notScanned: number; sinceDays: number } }) {
  if (!scanning) return <span className="text-muted-foreground">—</span>
  const total = scanning.scanned + scanning.notScanned
  if (total === 0) {
    return <span className="text-sm text-muted-foreground">No scanning yet · {scanning.sinceDays} days</span>
  }
  const pct = Math.round((scanning.scanned / total) * 100)
  return (
    <div className="min-w-32">
      <div className="mb-1 flex justify-between text-xs tabular-nums text-muted-foreground">
        <span>{pct}% scanned</span>
        <span>{scanning.sinceDays} days</span>
      </div>
      <div
        className="flex h-2 min-w-16 overflow-hidden rounded-full bg-muted"
        role="img"
        aria-label={`${pct}% of labels scanned in ${scanning.sinceDays} days`}
      >
        <i className={`block h-full ${pct < 70 ? "bg-foreground" : "bg-primary-fill"}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}
