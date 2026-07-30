import { useMemo, useState } from "react";

import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { Plus, SlidersHorizontal } from "lucide-react";

import type { PromoStatus } from "@effy/shared-types";
import { PROMO_STATUSES } from "@effy/shared-types";
import {
  Badge,
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

import { canManagePromotions } from "./access";
import { PromoCodeDialog } from "./components/PromoCodeDialog";
import { promoValueLabel, redemptionLabel, type PromoCode } from "./model";
import { promoListQuery } from "./queries";

// The promotional-code register (027 US10). A table, not cards — Principle V, and the operator's
// question here is comparative ("which codes are live, which are nearly exhausted"), which is what a
// table answers and a grid of cards does not.

const PAGE_SIZE = 20;
const ALL_STATUSES = "all";

function StatusBadge({ status }: { status: PromoStatus }) {
  return <Badge variant={status === "active" ? "success" : "muted"}>{status}</Badge>;
}

/** Live / Scheduled / Ended — derived from the window, so "active" never reads as "running now"
 *  for a code whose window has closed. Display only; the platform decides at apply time. */
function windowLabel(promo: PromoCode): string {
  const now = Date.now();
  if (promo.startsAt && new Date(promo.startsAt).getTime() > now) return "Scheduled";
  if (promo.endsAt && new Date(promo.endsAt).getTime() <= now) return "Ended";
  return "Open";
}

const columns: ColumnDef<PromoCode>[] = [
  {
    accessorKey: "code",
    header: "Code",
    cell: ({ row }) => (
      <Link
        to="/promotions/$promoId"
        params={{ promoId: row.original.id }}
        className="font-mono font-medium text-primary hover:underline"
      >
        {row.original.code}
      </Link>
    ),
  },
  { id: "value", header: "Value", cell: ({ row }) => promoValueLabel(row.original) },
  {
    accessorKey: "minimumSubtotalAmount",
    header: "Minimum",
    cell: ({ row }) =>
      Number(row.original.minimumSubtotalAmount) > 0 ? (
        <span className="tabular-nums">${row.original.minimumSubtotalAmount}</span>
      ) : (
        <span className="text-muted-foreground">—</span>
      ),
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => <StatusBadge status={row.original.status} />,
  },
  { id: "window", header: "Window", cell: ({ row }) => windowLabel(row.original) },
  {
    accessorKey: "redemptionCount",
    header: "Redeemed",
    cell: ({ row }) => <span className="tabular-nums">{redemptionLabel(row.original)}</span>,
  },
];

export function PromotionsListScreen() {
  const { data: session } = useQuery(sessionQuery);
  const roles = session?.status === "signed-in" ? session.identity.roles : [];
  const canManage = canManagePromotions(roles);

  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<PromoStatus | typeof ALL_STATUSES>(ALL_STATUSES);
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

  const { data, error, isPending, isError, refetch } = useQuery(promoListQuery(params));
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold">Promotions</h1>
          <p className="text-muted-foreground">
            Promotional codes and the order rules every cart is checked against.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" asChild>
            <Link to="/promotions/order-rules">
              <SlidersHorizontal />
              Order rules
            </Link>
          </Button>
          {canManage ? (
            <Button onClick={() => setCreateOpen(true)}>
              <Plus />
              Create code
            </Button>
          ) : null}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Input
          placeholder="Search by code…"
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
            setStatus(v as PromoStatus | typeof ALL_STATUSES);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_STATUSES}>All statuses</SelectItem>
            {PROMO_STATUSES.map((s) => (
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
          <DataTable columns={columns} data={data.items} emptyMessage="No codes match your filter." />
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">
              {data.total} code{data.total === 1 ? "" : "s"} · page {data.page} of {totalPages}
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

      {canManage ? <PromoCodeDialog open={createOpen} onOpenChange={setCreateOpen} /> : null}
    </div>
  );
}
