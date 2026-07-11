import { useMemo, useState } from "react";

import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { Plus } from "lucide-react";

import type { ShopLifecycleStatus } from "@effy/shared-types";
import { SHOP_LIFECYCLE_STATUSES } from "@effy/shared-types";
import {
  Button,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@effy/design-system/ui";
import { DataTable, ErrorState } from "@effy/web-kit/console";

import { sessionQuery } from "@/features/auth/queries";

import { canManageShops } from "./access";
import { CreateShopDialog } from "./components/CreateShopDialog";
import { ShopStatusBadge } from "./components/StatusBadge";
import type { ShopListItem } from "./model";
import { shopListQuery } from "./queries";

const PAGE_SIZE = 20;
const ALL_STATUSES = "all";

const columns: ColumnDef<ShopListItem>[] = [
  {
    accessorKey: "code",
    header: "Code",
    cell: ({ row }) => (
      <Link
        to="/shops/$shopId"
        params={{ shopId: row.original.id }}
        className="font-mono font-medium text-primary hover:underline"
      >
        {row.original.code}
      </Link>
    ),
  },
  { accessorKey: "name", header: "Name" },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => <ShopStatusBadge status={row.original.status} />,
  },
  {
    accessorKey: "userCount",
    header: "Users",
    cell: ({ row }) => <span className="tabular-nums">{row.original.userCount}</span>,
  },
];

export function ShopsListScreen() {
  const { data: session } = useQuery(sessionQuery);
  const roles = session?.status === "signed-in" ? session.identity.roles : [];
  const canManage = canManageShops(roles);

  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<ShopLifecycleStatus | typeof ALL_STATUSES>(ALL_STATUSES);
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);

  const params = useMemo(
    () => ({
      page,
      pageSize: PAGE_SIZE,
      status: status === ALL_STATUSES ? undefined : status,
      q: search.trim() || undefined,
    }),
    [page, status, search],
  );

  const { data, error, isPending, isError, refetch } = useQuery(shopListQuery(params));

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold">Shops</h1>
          <p className="text-muted-foreground">The platform's fulfillment shops and their operators.</p>
        </div>
        {canManage ? (
          <Button onClick={() => setCreateOpen(true)}>
            <Plus />
            Create shop
          </Button>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Input
          placeholder="Search by code or name…"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          className="max-w-xs"
        />
        <Select
          value={status}
          onValueChange={(v) => {
            setStatus(v as ShopLifecycleStatus | typeof ALL_STATUSES);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_STATUSES}>All statuses</SelectItem>
            {SHOP_LIFECYCLE_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isError ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : isPending ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <>
          <DataTable columns={columns} data={data.items} emptyMessage="No shops match your filter." />
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">
              {data.total} shop{data.total === 1 ? "" : "s"} · page {data.page} of {totalPages}
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        </>
      )}

      {canManage ? <CreateShopDialog open={createOpen} onOpenChange={setCreateOpen} /> : null}
    </div>
  );
}
