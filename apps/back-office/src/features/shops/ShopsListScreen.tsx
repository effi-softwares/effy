import { useMemo, useState } from "react";

import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Plus, Store } from "lucide-react";

import type { ShopLifecycleStatus } from "@effy/shared-types";
import { cn } from "@effy/design-system";
import { Button, Skeleton } from "@effy/design-system/ui";
import { ErrorState } from "@effy/web-kit/console";

import { PageHeader } from "@/components/patterns/Page";
import { EmptyState } from "@/components/patterns/States";
import { Pager, SearchBox, Toolbar } from "@/components/patterns/Toolbar";
import { sessionQuery } from "@/features/auth/queries";

import { canManageShops } from "./access";
import { CreateShopDialog } from "./components/CreateShopDialog";
import { ShopStatusBadge } from "./components/StatusBadge";
import type { ShopListItem } from "./model";
import { shopListQuery } from "./queries";

const PAGE_SIZE = 20;

type View = "all" | ShopLifecycleStatus;
const VIEWS: readonly { key: View; label: string }[] = [
  { key: "all", label: "All" },
  { key: "active", label: "Active" },
  { key: "suspended", label: "Suspended" },
  { key: "disabled", label: "Disabled" },
];

/**
 * The shop register (009; redesign, board "Shops"): the fulfilment shops behind the one brand — never
 * shown to a customer — with their operators and how well their labels scan.
 */
export function ShopsListScreen() {
  const { data: session } = useQuery(sessionQuery);
  const roles = session?.status === "signed-in" ? session.identity.roles : [];
  const canManage = canManageShops(roles);

  const [page, setPage] = useState(1);
  const [view, setView] = useState<View>("all");
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);

  const params = useMemo(
    () => ({ page, pageSize: PAGE_SIZE, status: view === "all" ? undefined : view, q: search.trim() || undefined }),
    [page, view, search],
  );
  const { data, error, isPending, isError, refetch } = useQuery(shopListQuery(params));
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <>
      <PageHeader
        title="Shops"
        description="The fulfilment shops behind Effy and their operators. Customers never see a shop."
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
        <nav className="bo-tabs" aria-label="Shop views">
          {VIEWS.map((v) => (
            <button
              key={v.key}
              type="button"
              aria-current={v.key === view ? "page" : undefined}
              className={cn("bo-tabs__tab", v.key === view && "is-active")}
              onClick={() => {
                setView(v.key);
                setPage(1);
              }}
            >
              {v.label}
              {v.key === view && data ? <span className="bo-tabs__count">{data.total}</span> : null}
            </button>
          ))}
        </nav>
        <Toolbar>
          <SearchBox
            label="Search shops"
            placeholder="Search by code or name…"
            value={search}
            onChange={(v) => {
              setSearch(v);
              setPage(1);
            }}
          />
        </Toolbar>
      </div>

      {isError ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : isPending ? (
        <div className="bo-table-wrap p-4" aria-busy="true">
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
        <div className="bo-table-wrap">
          <div className="bo-table-scroll">
            <table className="bo-table bo-rtable">
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Name</th>
                  <th>Address</th>
                  <th>Status</th>
                  <th className="text-right">Users</th>
                  <th>Label scanning</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((s) => (
                  <ShopRow key={s.id} shop={s} />
                ))}
              </tbody>
            </table>
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
  );
}

/** "92% scanned" with a thin bar, or that nothing was recorded — never a 0% that blames the shop. */
export function ScanRate({ scanning }: { scanning?: { scanned: number; notScanned: number; sinceDays: number } }) {
  if (!scanning) return <span className="text-muted-foreground">—</span>;
  const total = scanning.scanned + scanning.notScanned;
  if (total === 0) {
    return (
      <span className="bo-sub">
        No scanning yet · {scanning.sinceDays} days
      </span>
    );
  }
  const pct = Math.round((scanning.scanned / total) * 100);
  return (
    <div className="min-w-32">
      <div className="bo-progress-label">
        <span>{pct}% scanned</span>
        <span>{scanning.sinceDays} days</span>
      </div>
      <div className="bo-meter" role="img" aria-label={`${pct}% of labels scanned in ${scanning.sinceDays} days`}>
        <i className={pct < 70 ? "bo-meter__over" : "bo-meter__booked"} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function ShopRow({ shop: s }: { shop: ShopListItem }) {
  return (
    <tr>
      <td data-m="primary">
        <Link to="/shops/$shopId" params={{ shopId: s.id }} className="bo-link bo-code">
          {s.code}
        </Link>
      </td>
      <td data-m="meta">{s.name}</td>
      {/* A missing address is a named gap, not a blank cell. */}
      <td data-m="meta" data-label="Address">
        {s.hasAddress ? <span className="text-muted-foreground">Recorded</span> : <span className="font-medium">Not recorded</span>}
      </td>
      <td data-m="badge">
        <ShopStatusBadge status={s.status} />
      </td>
      <td data-m="meta" data-label="Users" className="text-right tabular-nums">
        {s.userCount}
      </td>
      <td data-m="trail">
        <ScanRate scanning={s.labelScanning} />
      </td>
    </tr>
  );
}
