import { useState } from "react";

import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { AlertTriangle, Pencil, ScanLine, UserPlus, Users } from "lucide-react";

import type { ShopLifecycleStatus, ShopRole, ShopStaffStatus } from "@effy/shared-types";
import {
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tabs,
  TabsContent,
  TabsCount,
  TabsList,
  TabsTrigger,
} from "@effy/design-system/ui";
import { ErrorState } from "@effy/web-kit/console";

import { PageHeader } from "@/components/patterns/Page";
import { DetailRows, Panel } from "@/components/patterns/Panel";
import { initialsOf } from "@/components/shell/identity";
import { useHeaderDetail } from "@/components/shell/SiteHeader";
import { sessionQuery } from "@/features/auth/queries";
import { track } from "@/lib/telemetry";

import { canManageShops } from "./access";
import { AddShopUserDialog } from "./components/AddShopUserDialog";
import { EditShopDialog } from "./components/EditShopDialog";
import { RemoveShopDialog } from "./components/RemoveShopDialog";
import { ShopHistory } from "./components/ShopHistory";
import { ShopStatusDialog } from "./components/ShopStatusMenu";
import { ShopStatusBadge, StaffStatusBadge } from "./components/StatusBadge";
import type { ShopDetail, ShopUser } from "./model";
import { shopDetailQuery, useSetPackScanning, useUpdateShopUser } from "./queries";
import { ShopStockPanel } from "./ShopStockPanel";
import { shopLowStockQuery } from "./stockQueries";

/**
 * A shop (009; redesign, boards "Shop — overview / team / stock / activity"): Overview · Team · Stock ·
 * Activity in tabs, "At a glance" on the right. Status changes and removal live in a danger zone, each
 * confirmed in a dialog that says what happens.
 */
const ROLE_LABELS: Record<ShopRole, string> = {
  shop_manager: "Shop manager",
  shop_staff: "Shop staff",
};

export function ShopDetailScreen({ shopId }: { shopId: string }) {
  const { data: session } = useQuery(sessionQuery);
  const roles = session?.status === "signed-in" ? session.identity.roles : [];
  const canManage = canManageShops(roles);

  const navigate = useNavigate();
  const { data, error, isPending, isError, refetch } = useQuery(shopDetailQuery(shopId));
  const lowStock = useQuery(shopLowStockQuery(shopId));
  useHeaderDetail(data?.name ?? null);

  const [editOpen, setEditOpen] = useState(false);
  const [addUserOpen, setAddUserOpen] = useState(false);
  const [removeOpen, setRemoveOpen] = useState(false);
  const [statusTarget, setStatusTarget] = useState<ShopLifecycleStatus | null>(null);
  const packScanning = useSetPackScanning(shopId);

  if (isError) return <ErrorState error={error} onRetry={() => void refetch()} />;
  if (isPending) {
    return (
      <div className="space-y-4" aria-busy="true">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-60" />
      </div>
    );
  }

  const shop = data;
  const active = shop.users.filter((u) => u.status === "active");
  const managers = active.filter((u) => u.roles.includes("shop_manager")).length;
  const scanning = shop.labelScanning;
  const scanTotal = scanning ? scanning.scanned + scanning.notScanned : 0;
  const low = (lowStock.data ?? []).filter((r) => r.severity !== "out").length;
  const out = (lowStock.data ?? []).filter((r) => r.severity === "out").length;
  // Where a driver is told to collect from. A missing address is a named gap.
  const address = shop.address?.addressLine1
    ? [shop.address.addressLine1, shop.address.addressLine2, shop.address.suburb, shop.address.state, shop.address.postcode].filter(Boolean).join(", ")
    : null;

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
            <span className="bo-code">{shop.code}</span>
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
          canManage ? (
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
          ) : null
        }
      />

      <div className="bo-detail">
        <div className="bo-detail__main">
          <Tabs defaultValue="overview">
            <div className="bo-tabsbar">
              <div className="bo-tabsbar__list">
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

            <TabsContent value="overview" className="bo-tabpanel">
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
                    { label: "Code", value: <span className="bo-code">{shop.code}</span> },
                    { label: "Address", value: address ?? <span className="font-medium">No address recorded — a driver cannot be sent here</span> },
                    { label: "Contact phone", value: shop.contactPhone ?? "—" },
                    { label: "Notes", value: shop.notes ?? "—" },
                    { label: "Created", value: formatTime(shop.createdAt) },
                    { label: "Updated", value: formatTime(shop.updatedAt) },
                  ]}
                />
              </Panel>

              {/* A shop whose labels often fail to scan is printing them badly. */}
              {scanning ? (
                <Panel
                  title="Label scanning"
                  description="How packages left this shop — scanned at collection, or recorded without a scan."
                  actions={<span className="bo-sub">Last {scanning.sinceDays} days</span>}
                >
                  <div className="space-y-3">
                    {scanTotal === 0 ? (
                      <p className="text-sm text-muted-foreground">{labelScanningText(scanning)}</p>
                    ) : (
                      <>
                        <div className="bo-progress-label">
                          <span>
                            {scanning.scanned} scanned · {scanning.notScanned} not scanned
                          </span>
                          <span className="font-semibold text-foreground">{Math.round((scanning.scanned / scanTotal) * 100)}%</span>
                        </div>
                        <div className="bo-meter">
                          <i className="bo-meter__booked" style={{ width: `${(scanning.scanned / scanTotal) * 100}%` }} />
                        </div>
                      </>
                    )}
                    <p className="bo-sub">
                      Not scanned means the driver typed the code or recorded the hand-over by hand. A falling rate usually means labels
                      aren't being printed.
                    </p>
                  </div>
                </Panel>
              ) : null}

              {/* The shop may not mark an order ready until every bag is scanned as packed. */}
              <Panel title="Packing" description="What this shop must do before an order can be marked ready.">
                <label className="flex items-start justify-between gap-4">
                  <span className="space-y-1">
                    <span className="block text-sm font-medium">Require pack scanning</span>
                    <span className="bo-sub block">
                      Every bag's label must be scanned as it is packed. Printing every label is always required.
                    </span>
                  </span>
                  <Switch
                    aria-label="Require pack scanning"
                    checked={shop.packScanRequired ?? false}
                    disabled={!canManage || packScanning.isPending}
                    onCheckedChange={(v) => packScanning.mutate(v, { onSuccess: () => track({ name: "shop_pack_scanning_changed", required: v }) })}
                  />
                </label>
                {packScanning.isError ? <p className="text-destructive mt-2 text-sm">That didn't save. Try again.</p> : null}
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

            <TabsContent value="team" className="bo-tabpanel">
              <Roster shop={shop} canManage={canManage} onAdd={() => setAddUserOpen(true)} />
            </TabsContent>

            {/* The assisted stock path. Reading is open to any active staff incl. csa. */}
            <TabsContent value="stock" className="bo-tabpanel">
              <Panel title="Stock" description="Products at or below their low-stock threshold, out of stock first.">
                <ShopStockPanel shopId={shop.id} canManage={canManage} />
              </Panel>
            </TabsContent>

            <TabsContent value="activity" className="bo-tabpanel">
              <ShopHistory shopId={shop.id} />
            </TabsContent>
          </Tabs>
        </div>

        <aside className="bo-detail__aside">
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
          <ShopStatusDialog shopId={shop.id} shopName={shop.name} target={statusTarget} onOpenChange={(o) => (o ? null : setStatusTarget(null))} />
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
  );
}

function DangerRow({ title, body, action, onClick }: { title: string; body: string; action: string; onClick: () => void }) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium">{title}</div>
        <p className="bo-sub">{body}</p>
      </div>
      <Button variant="outline" size="sm" onClick={onClick}>
        {action}
      </Button>
    </li>
  );
}

function Roster({ shop, canManage, onAdd }: { shop: ShopDetail; canManage: boolean; onAdd: () => void }) {
  const activeManagerCount = shop.users.filter((u) => u.status === "active" && u.roles.includes("shop_manager")).length;

  return (
    <Panel
      title="Team"
      description="Operators provisioned for this shop. They sign in to the shop console with a six-digit code."
      actions={
        canManage ? (
          <Button variant="outline" size="sm" onClick={onAdd}>
            <UserPlus aria-hidden="true" />
            Add user
          </Button>
        ) : null
      }
      footer={
        <span className="bo-sub">
          A role or status change applies straight away and is written to Activity. The last active manager can't be demoted or disabled.
        </span>
      }
      flush
    >
      <div className="bo-table-scroll">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Operator</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Last seen</TableHead>
              {canManage ? <TableHead className="text-right">Manage</TableHead> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {shop.users.length === 0 ? (
              <TableRow>
                <TableCell colSpan={canManage ? 5 : 4} className="h-20 text-center text-muted-foreground">
                  No operators yet.
                </TableCell>
              </TableRow>
            ) : (
              shop.users.map((user) => (
                <RosterRow
                  key={user.id}
                  shopId={shop.id}
                  user={user}
                  canManage={canManage}
                  isLastActiveManager={activeManagerCount === 1 && user.status === "active" && user.roles.includes("shop_manager")}
                />
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </Panel>
  );
}

function RosterRow({
  shopId,
  user,
  canManage,
  isLastActiveManager,
}: {
  shopId: string;
  user: ShopUser;
  canManage: boolean;
  isLastActiveManager: boolean;
}) {
  const primaryRole: ShopRole = user.roles.includes("shop_manager")
    ? "shop_manager"
    : "shop_staff";

  return (
    <TableRow>
      <TableCell>
        <div className="flex items-center gap-3">
          <span className="bo-avatar bo-avatar--sq" aria-hidden="true">
            {initialsOf(user.name ?? user.email ?? "?")}
          </span>
          <div className="flex min-w-0 flex-col">
            <span className="font-medium">{user.name ?? "—"}</span>
            <span className="text-xs text-muted-foreground">{user.email ?? "—"}</span>
          </div>
        </div>
      </TableCell>
      <TableCell>{user.roles.map((r) => ROLE_LABELS[r]).join(", ") || "—"}</TableCell>
      <TableCell>
        <StaffStatusBadge status={user.status} />
      </TableCell>
      <TableCell className="text-muted-foreground">
        {user.lastSeenAt ? formatTime(user.lastSeenAt) : "Never"}
      </TableCell>
      {canManage ? (
        <TableCell>
          <RosterControls
            shopId={shopId}
            userId={user.id}
            role={primaryRole}
            status={user.status}
            isLastActiveManager={isLastActiveManager}
          />
        </TableCell>
      ) : null}
    </TableRow>
  );
}

function RosterControls({
  shopId,
  userId,
  role,
  status,
  isLastActiveManager,
}: {
  shopId: string;
  userId: string;
  role: ShopRole;
  status: ShopStaffStatus;
  isLastActiveManager: boolean;
}) {
  const updateUser = useUpdateShopUser(shopId);

  function changeRole(next: ShopRole) {
    if (next === role) return;
    updateUser.mutate(
      { userId, body: { role: next } },
      { onSuccess: () => track({ name: "shop_user_role_changed", shopId }) },
    );
  }

  function toggleStatus() {
    const next: ShopStaffStatus = status === "active" ? "disabled" : "active";
    updateUser.mutate(
      { userId, body: { status: next } },
      { onSuccess: () => track({ name: "shop_user_status_changed", shopId }) },
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center justify-end gap-2">
        <Select value={role} onValueChange={(v) => changeRole(v as ShopRole)}>
          <SelectTrigger size="sm" className="w-36" disabled={updateUser.isPending}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="shop_manager">{ROLE_LABELS.shop_manager}</SelectItem>
            <SelectItem value="shop_staff">{ROLE_LABELS.shop_staff}</SelectItem>
          </SelectContent>
        </Select>
        <Button
          variant="outline"
          size="sm"
          disabled={updateUser.isPending}
          onClick={toggleStatus}
        >
          {status === "active" ? "Disable" : "Enable"}
        </Button>
      </div>
      {isLastActiveManager ? (
        <p className="flex items-center gap-1 text-xs font-medium text-foreground">
          <AlertTriangle className="size-3" />
          Only active manager — changing this leaves the shop without one.
        </p>
      ) : null}
    </div>
  );
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}

/** "8 scanned · 2 not scanned (20%) · last 30 days", or that nothing is recorded yet. */
export function labelScanningText(l: { scanned: number; notScanned: number; sinceDays: number }): string {
  const total = l.scanned + l.notScanned;
  if (total === 0) return `No scanning recorded in the last ${l.sinceDays} days`;
  const share = Math.round((l.notScanned / total) * 100);
  return `${l.scanned} scanned · ${l.notScanned} not scanned (${share}%) · last ${l.sinceDays} days`;
}
