import { useMemo, useState } from "react"

import { useQuery } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import { Plus, Store } from "lucide-react"

import type { ShopLifecycleStatus } from "@effy/shared-types"
import {
  Button,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tabs,
  TabsCount,
  TabsList,
  TabsTrigger,
} from "@effy/design-system/ui"
import { ErrorState } from "@effy/web-kit/console"

import { PageHeader, EmptyState, Pager, SearchBox, Toolbar } from "@effy/web-kit/patterns"
import { sessionQuery } from "@/features/auth/queries"

import { canManageShops } from "./access"
import { CreateShopDialog } from "./components/CreateShopDialog"
import { ShopStatusBadge } from "./components/StatusBadge"
import type { ShopListItem } from "./model"
import { shopListQuery } from "./queries"

const PAGE_SIZE = 20

type View = "all" | ShopLifecycleStatus
const VIEWS: readonly { key: View; label: string }[] = [
  { key: "all", label: "All" },
  { key: "active", label: "Active" },
  { key: "suspended", label: "Suspended" },
  { key: "disabled", label: "Disabled" },
]

export function ShopsListScreen() {
  const { data: session } = useQuery(sessionQuery)
  const roles = session?.status === "signed-in" ? session.identity.roles : []
  const canManage = canManageShops(roles)

  const [page, setPage] = useState(1)
  const [view, setView] = useState<View>("all")
  const [search, setSearch] = useState("")
  const [createOpen, setCreateOpen] = useState(false)

  const params = useMemo(
    () => ({ page, pageSize: PAGE_SIZE, status: view === "all" ? undefined : view, q: search.trim() || undefined }),
    [page, view, search],
  )
  const { data, error, isPending, isError, refetch } = useQuery(shopListQuery(params))
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1

  return (
    <>
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

      <div className="space-y-3">
        <Tabs
          value={view}
          onValueChange={(v) => {
            setView(v as View)
            setPage(1)
          }}
        >
          <TabsList aria-label="Shop views">
            {VIEWS.map((v) => (
              <TabsTrigger key={v.key} value={v.key}>
                {v.label}
                {v.key === view && data ? <TabsCount>{data.total}</TabsCount> : null}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <Toolbar>
          <SearchBox
            label="Search shops"
            placeholder="Search by code or name…"
            value={search}
            onChange={(v) => {
              setSearch(v)
              setPage(1)
            }}
          />
        </Toolbar>
      </div>

      {isError ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : isPending ? (
        <div className="overflow-hidden rounded-xl border bg-card p-4" aria-busy="true">
          <Skeleton className="mb-3 h-10" />
          <Skeleton className="mb-3 h-10" />
          <Skeleton className="h-10" />
        </div>
      ) : data.items.length === 0 ? (
        <EmptyState
          icon={Store}
          title={search || view !== "all" ? "No shops match your filter." : "No shops yet."}
          description={search || view !== "all" ? undefined : "Create the first shop to give its operators a sign-in."}
        />
      ) : (
        <div className="overflow-hidden rounded-xl border bg-card">
          <div className="min-w-0">
            <Table className="ef-rtable">
              <TableHeader>
                <TableRow>
                  <TableHead>Code</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Address</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Users</TableHead>
                  <TableHead>Label scanning</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.items.map((s) => (
                  <ShopRow key={s.id} shop={s} />
                ))}
              </TableBody>
            </Table>
          </div>
          <Pager
            summary={`${data.total} shop${data.total === 1 ? "" : "s"} · page ${data.page} of ${totalPages}`}
            canBack={page > 1}
            canNext={page < totalPages}
            onBack={() => setPage((p) => Math.max(1, p - 1))}
            onNext={() => setPage((p) => p + 1)}
          />
        </div>
      )}

      {canManage ? <CreateShopDialog open={createOpen} onOpenChange={setCreateOpen} /> : null}
    </>
  )
}

function ScanRate({ scanning }: { scanning?: { scanned: number; notScanned: number; sinceDays: number } }) {
  if (!scanning) return <span className="text-muted-foreground">—</span>
  const total = scanning.scanned + scanning.notScanned
  if (total === 0) {
    return (
      <span className="mt-0.5 block text-sm text-muted-foreground">No scanning yet · {scanning.sinceDays} days</span>
    )
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

function ShopRow({ shop: s }: { shop: ShopListItem }) {
  return (
    <TableRow>
      <TableCell data-m="primary">
        <Link to="/shops/$shopId" params={{ shopId: s.id }} className="link font-mono">
          {s.code}
        </Link>
      </TableCell>
      <TableCell data-m="meta">{s.name}</TableCell>
      <TableCell data-m="meta" data-label="Address">
        {s.hasAddress ? (
          <span className="text-muted-foreground">Recorded</span>
        ) : (
          <span className="font-medium">Not recorded</span>
        )}
      </TableCell>
      <TableCell data-m="badge">
        <ShopStatusBadge status={s.status} />
      </TableCell>
      <TableCell data-m="meta" data-label="Users" className="text-right tabular-nums">
        {s.userCount}
      </TableCell>
      <TableCell data-m="trail">
        <ScanRate scanning={s.labelScanning} />
      </TableCell>
    </TableRow>
  )
}
