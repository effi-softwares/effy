import { AlertTriangle, UserPlus } from "lucide-react"

import type { ShopRole, ShopStaffStatus } from "@effy/shared-types"
import {
  Avatar,
  AvatarFallback,
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@effy/design-system/ui"
import { StaticTable, type EffyColumnDef } from "@effy/web-kit/data-table"
import { Panel } from "@effy/web-kit/patterns"
import { initialsOf } from "@/components/shell/identity"
import { track } from "@/lib/telemetry"
import { StaffStatusBadge } from "./components/StatusBadge"
import type { ShopDetail, ShopUser } from "./model"
import { useUpdateShopUser } from "./queries"

import { formatTime } from "./shopText"

const ROLE_LABELS: Record<ShopRole, string> = {
  shop_manager: "Shop manager",
  shop_staff: "Shop staff",
}

export function ShopRoster({ shop, canManage, onAdd }: { shop: ShopDetail; canManage: boolean; onAdd: () => void }) {
  const activeManagerCount = shop.users.filter((u) => u.status === "active" && u.roles.includes("shop_manager")).length

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
        <span className="mt-0.5 block text-sm text-muted-foreground">
          A role or status change applies straight away and is written to Activity. The last active manager can't be
          demoted or disabled.
        </span>
      }
      flush
    >
      <StaticTable
        label="Team"
        columns={rosterColumns(shop.id, canManage, activeManagerCount)}
        rows={shop.users}
        getRowId={(u) => u.id}
        initialSort={{ id: "operator" }}
        empty="No operators yet."
        framed={false}
      />
    </Panel>
  )
}

/** A shop's team, shown whole (103 FR-024: a capped set) and sorted in the browser. */
function rosterColumns(shopId: string, canManage: boolean, activeManagerCount: number): EffyColumnDef<ShopUser>[] {
  return [
    {
      id: "operator",
      accessorFn: (u) => (u.name ?? u.email ?? "").toLowerCase(),
      header: "Operator",
      cell: ({ row }) => {
        const user = row.original
        return (
          <div className="flex items-center gap-3">
            <Avatar aria-hidden="true" className="rounded-lg max-md:hidden">
              <AvatarFallback className="rounded-lg">{initialsOf(user.name ?? user.email ?? "?")}</AvatarFallback>
            </Avatar>
            <div className="flex min-w-0 flex-col">
              <span className="font-medium">{user.name ?? "-"}</span>
              <span className="text-xs text-muted-foreground">{user.email ?? "-"}</span>
            </div>
          </div>
        )
      },
      meta: { label: "Operator", identifying: true, phone: "primary" },
    },
    {
      id: "role",
      accessorFn: (u) => (u.roles.includes("shop_manager") ? 0 : 1),
      header: "Role",
      cell: ({ row }) => row.original.roles.map((r) => ROLE_LABELS[r]).join(", ") || "-",
      meta: { label: "Role" },
    },
    {
      id: "status",
      header: "Status",
      enableSorting: false,
      cell: ({ row }) => <StaffStatusBadge status={row.original.status} />,
      meta: { label: "Status", phone: "badge" },
    },
    {
      id: "lastSeen",
      accessorFn: (u) => u.lastSeenAt ?? "",
      sortDescFirst: true,
      header: "Last seen",
      cell: ({ row }) => (
        <span className="text-muted-foreground">{row.original.lastSeenAt ? formatTime(row.original.lastSeenAt) : "Never"}</span>
      ),
      meta: { label: "Last seen", priority: 2, phone: "trail" },
    },
    ...(canManage
      ? [
        {
          id: "manage",
          header: () => <span className="sr-only">Manage</span>,
          enableSorting: false,
          cell: ({ row }) => {
            const user = row.original
            return (
              <RosterControls
                shopId={shopId}
                userId={user.id}
                role={user.roles.includes("shop_manager") ? "shop_manager" : "shop_staff"}
                status={user.status}
                isLastActiveManager={
                  activeManagerCount === 1 && user.status === "active" && user.roles.includes("shop_manager")
                }
              />
            )
          },
          meta: { label: "Manage", phone: "full" },
        } satisfies EffyColumnDef<ShopUser>,
      ]
      : []),
  ]
}

function RosterControls({
  shopId,
  userId,
  role,
  status,
  isLastActiveManager,
}: {
  shopId: string
  userId: string
  role: ShopRole
  status: ShopStaffStatus
  isLastActiveManager: boolean
}) {
  const updateUser = useUpdateShopUser(shopId)

  function changeRole(next: ShopRole) {
    if (next === role) return
    updateUser.mutate(
      { userId, body: { role: next } },
      { onSuccess: () => track({ name: "shop_user_role_changed", shopId }) },
    )
  }

  function toggleStatus() {
    const next: ShopStaffStatus = status === "active" ? "disabled" : "active"
    updateUser.mutate(
      { userId, body: { status: next } },
      { onSuccess: () => track({ name: "shop_user_status_changed", shopId }) },
    )
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
        <Button variant="outline" size="sm" disabled={updateUser.isPending} onClick={toggleStatus}>
          {status === "active" ? "Disable" : "Enable"}
        </Button>
      </div>
      {isLastActiveManager ? (
        <p className="flex items-center gap-1 text-xs font-medium text-foreground">
          <AlertTriangle className="size-3" />
          Only active manager - changing this leaves the shop without one.
        </p>
      ) : null}
    </div>
  )
}
