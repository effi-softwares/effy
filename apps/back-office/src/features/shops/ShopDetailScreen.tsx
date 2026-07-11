import { useState } from "react";

import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { AlertTriangle, ArrowLeft, Pencil, Trash2, UserPlus } from "lucide-react";

import type { ShopRole, ShopStaffStatus } from "@effy/shared-types";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
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
} from "@effy/design-system/ui";
import { ErrorState } from "@effy/web-kit/console";

import { sessionQuery } from "@/features/auth/queries";
import { track } from "@/lib/telemetry";

import { canManageShops } from "./access";
import { AddShopUserDialog } from "./components/AddShopUserDialog";
import { EditShopDialog } from "./components/EditShopDialog";
import { RemoveShopDialog } from "./components/RemoveShopDialog";
import { ShopStatusMenu } from "./components/ShopStatusMenu";
import { ShopStatusBadge, StaffStatusBadge } from "./components/StatusBadge";
import type { ShopDetail, ShopUser } from "./model";
import { shopDetailQuery, useUpdateShopUser } from "./queries";
import { ShopHistory } from "./components/ShopHistory";

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

  const [editOpen, setEditOpen] = useState(false);
  const [addUserOpen, setAddUserOpen] = useState(false);
  const [removeOpen, setRemoveOpen] = useState(false);

  if (isError) return <ErrorState error={error} onRetry={() => void refetch()} />;
  if (isPending) return <p className="text-sm text-muted-foreground">Loading…</p>;

  const shop = data;

  return (
    <div className="space-y-6">
      <div>
        <Button variant="ghost" size="sm" onClick={() => navigate({ to: "/shops" })}>
          <ArrowLeft />
          All shops
        </Button>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-semibold">{shop.name}</h1>
            <ShopStatusBadge status={shop.status} />
          </div>
          <p className="font-mono text-sm text-muted-foreground">{shop.code}</p>
        </div>
        {canManage ? (
          <div className="flex flex-wrap gap-2">
            <ShopStatusMenu shopId={shop.id} current={shop.status} />
            <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
              <Pencil />
              Edit
            </Button>
            <Button variant="outline" size="sm" onClick={() => setAddUserOpen(true)}>
              <UserPlus />
              Add user
            </Button>
            <Button variant="destructive" size="sm" onClick={() => setRemoveOpen(true)}>
              <Trash2 />
              Remove
            </Button>
          </div>
        ) : null}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Details</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <Field label="Contact phone" value={shop.contactPhone ?? "—"} />
            <Field label="Notes" value={shop.notes ?? "—"} />
            <Field label="Created" value={formatTime(shop.createdAt)} />
            <Field label="Updated" value={formatTime(shop.updatedAt)} />
          </dl>
        </CardContent>
      </Card>

      <Roster shop={shop} canManage={canManage} />

      <ShopHistory shopId={shop.id} />

      {canManage ? (
        <>
          <EditShopDialog shop={shop} open={editOpen} onOpenChange={setEditOpen} />
          <AddShopUserDialog shopId={shop.id} open={addUserOpen} onOpenChange={setAddUserOpen} />
          <RemoveShopDialog
            shopId={shop.id}
            shopName={shop.name}
            open={removeOpen}
            onOpenChange={setRemoveOpen}
            onRemoved={() => navigate({ to: "/shops" })}
          />
        </>
      ) : null}
    </div>
  );
}

function Roster({ shop, canManage }: { shop: ShopDetail; canManage: boolean }) {
  const activeManagerCount = shop.users.filter(
    (u) => u.status === "active" && u.roles.includes("shop_manager"),
  ).length;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Roster</CardTitle>
        <CardDescription>Operators provisioned for this shop.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Operator</TableHead>
                <TableHead>Roles</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Last seen</TableHead>
                {canManage ? <TableHead className="text-right">Manage</TableHead> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {shop.users.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={canManage ? 5 : 4}
                    className="h-20 text-center text-muted-foreground"
                  >
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
                      activeManagerCount === 1 &&
                      user.status === "active" &&
                      user.roles.includes("shop_manager")
                    }
                  />
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
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
        <div className="flex flex-col">
          <span className="font-medium">{user.name ?? "—"}</span>
          <span className="text-xs text-muted-foreground">{user.email ?? "—"}</span>
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
        <p className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
          <AlertTriangle className="size-3" />
          Only active manager — changing this leaves the shop without one.
        </p>
      ) : null}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <dt className="text-muted-foreground">{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}
