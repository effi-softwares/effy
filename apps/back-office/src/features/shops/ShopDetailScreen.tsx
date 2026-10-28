import { useState } from "react"

import { useQuery } from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"
import { Boxes, Pencil, ScanLine, UserPlus, Users } from "lucide-react"

import type { ShopLifecycleStatus } from "@effy/shared-types"
import {
  Button,
  Progress,
  Skeleton,
  Switch,
  Tabs,
  TabsContent,
  TabsCount,
  TabsList,
  TabsTrigger,
} from "@effy/design-system/ui"
import { ErrorState, useHeaderDetail } from "@effy/web-kit/console"

import { DetailRows, MoreActions, PageHeader, Panel } from "@effy/web-kit/patterns"
import { sessionQuery } from "@/features/auth/queries"
import { track } from "@/lib/telemetry"

import { canManageShops } from "./access"
import { AddShopUserDialog } from "./components/AddShopUserDialog"
import { EditShopDialog } from "./components/EditShopDialog"
import { RemoveShopDialog } from "./components/RemoveShopDialog"
import { ShopHistory } from "./components/ShopHistory"
import { ShopStatusDialog } from "./components/ShopStatusMenu"
import { ShopStatusBadge } from "./components/StatusBadge"
import { shopDetailQuery, useSetPackScanning } from "./queries"
import { ShopStockPanel } from "./ShopStockPanel"
import { shopLowStockQuery } from "./stockQueries"
import { ShopRoster } from "./ShopRoster"
import { formatTime, labelScanningText } from "./shopText"

export function ShopDetailScreen({ shopId }: { shopId: string }) {
  const { data: session } = useQuery(sessionQuery)
  const roles = session?.status === "signed-in" ? session.identity.roles : []
  const canManage = canManageShops(roles)

  const navigate = useNavigate()
  const { data, error, isPending, isError, refetch } = useQuery(shopDetailQuery(shopId))
  const lowStock = useQuery(shopLowStockQuery(shopId))
  useHeaderDetail(data?.name ?? null)

  const [editOpen, setEditOpen] = useState(false)
  const [addUserOpen, setAddUserOpen] = useState(false)
  const [removeOpen, setRemoveOpen] = useState(false)
  const [statusTarget, setStatusTarget] = useState<ShopLifecycleStatus | null>(null)
  const packScanning = useSetPackScanning(shopId)

  if (isError) return <ErrorState error={error} onRetry={() => void refetch()} />
  if (isPending) {
    return (
      <div className="space-y-4" aria-busy="true">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-60" />
      </div>
    )
  }

  const shop = data
  const active = shop.users.filter((u) => u.status === "active")
  const managers = active.filter((u) => u.roles.includes("shop_manager")).length
  const scanning = shop.labelScanning
  const scanTotal = scanning ? scanning.scanned + scanning.notScanned : 0
  const low = (lowStock.data ?? []).filter((r) => r.severity !== "out").length
  const out = (lowStock.data ?? []).filter((r) => r.severity === "out").length
  // Where a driver is told to collect from. A missing address is a named gap.
  const address = shop.address?.addressLine1
    ? [
        shop.address.addressLine1,
        shop.address.addressLine2,
        shop.address.suburb,
        shop.address.state,
        shop.address.postcode,
      ]
        .filter(Boolean)
        .join(", ")
    : null

  return (
    <>
      <PageHeader
        back={{ label: "Shops", link: { to: "/shops" } }}
        title={
          <span className="flex flex-wrap items-center gap-3">
            {shop.name}
            <ShopStatusBadge status={shop.status} />
          </span>
        }
        meta={
          <>
            <span className="font-mono">{shop.code}</span>
            <span>
              <Users aria-hidden="true" />
              {shop.users.length} {shop.users.length === 1 ? "operator" : "operators"}
            </span>
            {scanning && scanTotal > 0 ? (
              <span>
                <ScanLine aria-hidden="true" />
                {Math.round((scanning.scanned / scanTotal) * 100)}% of labels scanned · last {scanning.sinceDays} days
              </span>
            ) : null}
          </>
        }
        actions={
          <>
            {canManage ? (
              <>
                <Button variant="outline" onClick={() => setEditOpen(true)}>
                  <Pencil aria-hidden="true" />
                  Edit details
                </Button>
                <Button onClick={() => setAddUserOpen(true)}>
                  <UserPlus aria-hidden="true" />
                  Add user
                </Button>
              </>
            ) : null}
            {/* Every product of this shop, in Catalogue › Products (102). Read by anyone who sees the shop. */}
            <MoreActions
              actions={[
                { label: "Products", icon: Boxes, link: { to: "/products", search: { shopId: shop.id } } as never },
              ]}
            />
          </>
        }
      />

      <div className="ef-detail">
        <div className="ef-detail__main">
          <Tabs defaultValue="overview">
            <div className="ef-tabsbar">
              <div className="ef-tabsbar__list">
                <TabsList aria-label="Shop sections">
                  <TabsTrigger value="overview">Overview</TabsTrigger>
                  <TabsTrigger value="team">
                    Team
                    <TabsCount>{shop.users.length}</TabsCount>
                  </TabsTrigger>
                  <TabsTrigger value="stock">
                    Stock
                    {lowStock.data && lowStock.data.length > 0 ? <TabsCount>{lowStock.data.length}</TabsCount> : null}
                  </TabsTrigger>
                  <TabsTrigger value="activity">Activity</TabsTrigger>
                </TabsList>
              </div>
            </div>

            <TabsContent value="overview" className="ef-tabpanel">
              <Panel
                title="Details"
                description="The address is for drivers only and is never shown to customers."
                actions={
                  canManage ? (
                    <Button variant="ghost" size="sm" onClick={() => setEditOpen(true)}>
                      Edit
                    </Button>
                  ) : null
                }
              >
                <DetailRows
                  rows={[
                    { label: "Code", value: <span className="font-mono">{shop.code}</span> },
                    {
                      label: "Address",
                      value: address ?? (
                        <span className="font-medium">No address recorded — a driver cannot be sent here</span>
                      ),
                    },
                    { label: "Contact phone", value: shop.contactPhone ?? "—" },
                    { label: "Notes", value: shop.notes ?? "—" },
                    { label: "Created", value: formatTime(shop.createdAt) },
                    { label: "Updated", value: formatTime(shop.updatedAt) },
                  ]}
                />
              </Panel>

              {scanning ? (
                <Panel
                  title="Label scanning"
                  description="How packages left this shop — scanned at collection, or recorded without a scan."
                  actions={
                    <span className="mt-0.5 block text-sm text-muted-foreground">Last {scanning.sinceDays} days</span>
                  }
                >
                  <div className="space-y-3">
                    {scanTotal === 0 ? (
                      <p className="text-sm text-muted-foreground">{labelScanningText(scanning)}</p>
                    ) : (
                      <>
                        <div className="mb-1 flex justify-between text-xs tabular-nums text-muted-foreground">
                          <span>
                            {scanning.scanned} scanned · {scanning.notScanned} not scanned
                          </span>
                          <span className="font-semibold text-foreground">
                            {Math.round((scanning.scanned / scanTotal) * 100)}%
                          </span>
                        </div>
                        <Progress value={(scanning.scanned / scanTotal) * 100} height={8} />
                      </>
                    )}
                    <p className="mt-0.5 block text-sm text-muted-foreground">
                      Not scanned means the driver typed the code or recorded the hand-over by hand. A falling rate
                      usually means labels aren't being printed.
                    </p>
                  </div>
                </Panel>
              ) : null}

              <Panel title="Packing" description="What this shop must do before an order can be marked ready.">
                <label className="flex items-start justify-between gap-4">
                  <span className="space-y-1">
                    <span className="block text-sm font-medium">Require pack scanning</span>
                    <span className="mt-0.5 block text-sm text-muted-foreground block">
                      Every bag's label must be scanned as it is packed. Printing every label is always required.
                    </span>
                  </span>
                  <Switch
                    aria-label="Require pack scanning"
                    checked={shop.packScanRequired ?? false}
                    disabled={!canManage || packScanning.isPending}
                    onCheckedChange={(v) =>
                      packScanning.mutate(v, {
                        onSuccess: () => track({ name: "shop_pack_scanning_changed", required: v }),
                      })
                    }
                  />
                </label>
                {packScanning.isError ? (
                  <p className="text-destructive mt-2 text-sm">That didn't save. Try again.</p>
                ) : null}
              </Panel>

              {canManage ? (
                <Panel title="Danger zone" flush>
                  <ul className="divide-y divide-border">
                    {shop.status !== "suspended" ? (
                      <DangerRow
                        title="Suspend this shop"
                        body="Operators keep their sign-in but can't take new work. Packages already packed still go out. You can activate it again."
                        action="Suspend…"
                        onClick={() => setStatusTarget("suspended")}
                      />
                    ) : null}
                    {shop.status !== "active" ? (
                      <DangerRow
                        title="Activate this shop"
                        body="New work reaches the shop again and its operators can sign in."
                        action="Activate…"
                        onClick={() => setStatusTarget("active")}
                      />
                    ) : null}
                    {shop.status !== "disabled" ? (
                      <DangerRow
                        title="Disable this shop"
                        body="Every operator's sign-in stops and no work reaches the shop. History is kept."
                        action="Disable…"
                        onClick={() => setStatusTarget("disabled")}
                      />
                    ) : null}
                    <DangerRow
                      title="Remove this shop"
                      body="Only a shop that never had operators can be removed. Otherwise, disable it."
                      action="Remove…"
                      onClick={() => setRemoveOpen(true)}
                    />
                  </ul>
                </Panel>
              ) : null}
            </TabsContent>

            <TabsContent value="team" className="ef-tabpanel">
              <ShopRoster shop={shop} canManage={canManage} onAdd={() => setAddUserOpen(true)} />
            </TabsContent>

            <TabsContent value="stock" className="ef-tabpanel">
              <Panel title="Stock" description="Products at or below their low-stock threshold, out of stock first.">
                <ShopStockPanel shopId={shop.id} canManage={canManage} />
              </Panel>
            </TabsContent>

            <TabsContent value="activity" className="ef-tabpanel">
              <ShopHistory shopId={shop.id} />
            </TabsContent>
          </Tabs>
        </div>

        <aside className="ef-detail__aside">
          <Panel title="At a glance">
            <DetailRows
              tight
              rows={[
                { label: "Managers", value: `${managers} active` },
                { label: "Staff", value: `${active.length - managers} active` },
                {
                  label: "Low stock",
                  value: lowStock.data ? (low + out === 0 ? "Nothing low" : `${low} low · ${out} out of stock`) : "—",
                },
                { label: "Address", value: address ? "Recorded" : <span className="font-medium">Not recorded</span> },
              ]}
            />
          </Panel>
        </aside>
      </div>

      {canManage ? (
        <>
          <EditShopDialog shop={shop} open={editOpen} onOpenChange={setEditOpen} />
          <AddShopUserDialog shopId={shop.id} open={addUserOpen} onOpenChange={setAddUserOpen} />
          <ShopStatusDialog
            shopId={shop.id}
            shopName={shop.name}
            target={statusTarget}
            onOpenChange={(o) => (o ? null : setStatusTarget(null))}
          />
          <RemoveShopDialog
            shopId={shop.id}
            shopName={shop.name}
            open={removeOpen}
            onOpenChange={setRemoveOpen}
            onRemoved={() => navigate({ to: "/shops" })}
          />
        </>
      ) : null}
    </>
  )
}

function DangerRow({
  title,
  body,
  action,
  onClick,
}: {
  title: string
  body: string
  action: string
  onClick: () => void
}) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium">{title}</div>
        <p className="mt-0.5 block text-sm text-muted-foreground">{body}</p>
      </div>
      <Button variant="outline" size="sm" onClick={onClick}>
        {action}
      </Button>
    </li>
  )
}
