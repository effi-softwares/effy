import { AlertTriangle, UserPlus } from "lucide-react"

import type { ShopRole, ShopStaffStatus } from "@effy/shared-types"
import {
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@effy/design-system/ui"
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
        <span className="bo-sub">
          A role or status change applies straight away and is written to Activity. The last active manager can't be
          demoted or disabled.
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
                  isLastActiveManager={
                    activeManagerCount === 1 && user.status === "active" && user.roles.includes("shop_manager")
                  }
                />
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </Panel>
  )
}

function RosterRow({
  shopId,
  user,
  canManage,
  isLastActiveManager,
}: {
  shopId: string
  user: ShopUser
  canManage: boolean
  isLastActiveManager: boolean
}) {
  const primaryRole: ShopRole = user.roles.includes("shop_manager") ? "shop_manager" : "shop_staff"

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
      <TableCell className="text-muted-foreground">{user.lastSeenAt ? formatTime(user.lastSeenAt) : "Never"}</TableCell>
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
  )
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
          Only active manager — changing this leaves the shop without one.
        </p>
      ) : null}
    </div>
  )
}
