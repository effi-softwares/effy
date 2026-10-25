import { useMemo, useState } from "react";

import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";

import { CircleAlert, UserX } from "lucide-react";

import { cn } from "@effy/design-system";
import { Checkbox, Skeleton } from "@effy/design-system/ui";
import { ErrorState } from "@effy/web-kit/console";
import type { AdminDriverListItem, DriverEmploymentStatus } from "@effy/shared-types";

import { PageHeader } from "@effy/web-kit/patterns";
import { EmptyState } from "@effy/web-kit/patterns";
import { DotWord, StatusWord } from "@effy/web-kit/patterns";
import { Facet, Pager, SearchBox, Toolbar, ToolbarSpacer } from "@effy/web-kit/patterns";
import { initialsOf } from "@/components/shell/identity";
import { useSessionRoles } from "@/features/auth/useSessionRoles";

import { CreateDriverDialog } from "./components/CreateDriverDialog";
import { DutyPanel } from "./components/DutyPanel";
import { ReadinessPanel } from "./components/ReadinessPanel";
import { canManageDrivers } from "./access";
import { BLOCKED_LABEL, STATUS_LABEL, type DriverListParams } from "./model";
import { driversListQuery, readinessQuery, zonesQuery } from "./queries";

/** The driver register: a table, no metric tiles. An expired licence is an ordinary fact, said in words, not an error state. */

function blockedSummary(d: AdminDriverListItem): string | null {
  if (d.blockedReasons.length === 0) return null;
  return d.blockedReasons.map((r) => BLOCKED_LABEL[r]).join(" · ");
}

type View = "all" | "active" | "suspended" | "offboarded" | "readiness";
const VIEWS: readonly { key: View; label: string }[] = [
  { key: "all", label: "All employed" },
  { key: "active", label: "Active" },
  { key: "suspended", label: "Suspended" },
  { key: "offboarded", label: "Offboarded" },
  { key: "readiness", label: "Readiness" },
];

/**
 * Drivers (056; redesign, board "Drivers"): who is on duty now, then the register — by employment
 * status, searchable, filterable by zone — and Readiness: who cannot be given work, what to renew,
 * and work nobody can cover.
 */
export function DriversListScreen() {
  const roles = useSessionRoles();
  const canManage = canManageDrivers(roles);

  const [view, setView] = useState<View>("all");
  const [search, setSearch] = useState("");
  const [zoneId, setZoneId] = useState<string | null>(null);
  const [includeOffboarded, setIncludeOffboarded] = useState(false);
  const [cursors, setCursors] = useState<string[]>([]);

  const status = view === "all" || view === "readiness" ? "" : (view as DriverEmploymentStatus);
  const params: DriverListParams = useMemo(
    () => ({
      q: search.trim() || undefined,
      status,
      zoneId: zoneId ?? undefined,
      // Offboarded drivers are hidden by default; the Offboarded view asks for them.
      includeOffboarded: includeOffboarded || view === "offboarded",
      cursor: cursors[cursors.length - 1],
    }),
    [search, status, zoneId, includeOffboarded, view, cursors],
  );

  const { data, error, isPending, isError, refetch } = useQuery({ ...driversListQuery(params), enabled: view !== "readiness" });
  const zones = useQuery(zonesQuery());
  const readiness = useQuery(readinessQuery());
  const blockedCount = readiness.data?.blocked.length;

  function resetPaging<T>(set: (v: T) => void) {
    return (v: T) => {
      set(v);
      setCursors([]);
    };
  }

  return (
    <>
      <PageHeader
        title="Drivers"
        description="Effy's drivers, whether they are cleared to work, and any incidents on the road."
        actions={canManage ? <CreateDriverDialog /> : undefined}
      />

      <DutyPanel />

      <div className="space-y-3">
        <nav className="bo-tabs" aria-label="Driver views">
          {VIEWS.map((v) => (
            <button
              key={v.key}
              type="button"
              aria-current={v.key === view ? "page" : undefined}
              className={cn("bo-tabs__tab", v.key === view && "is-active")}
              onClick={() => resetPaging(setView)(v.key)}
            >
              {v.label}
              {v.key === "readiness" && blockedCount ? (
                <span className={cn("bo-tabs__count", view !== "readiness" && "bo-tabs__count--primary")}>{blockedCount}</span>
              ) : null}
            </button>
          ))}
        </nav>
        {view !== "readiness" ? (
          <Toolbar>
            <SearchBox label="Search drivers" placeholder="Search by name or work email…" value={search} onChange={resetPaging(setSearch)} />
            <Facet
              label="Zone"
              anyLabel="Any zone"
              value={zoneId}
              onChange={resetPaging(setZoneId)}
              options={(zones.data ?? []).map((z) => ({ value: z.id, label: z.name }))}
            />
            <ToolbarSpacer />
            {view === "all" ? (
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={includeOffboarded} onCheckedChange={(v) => resetPaging(setIncludeOffboarded)(v === true)} />
                Include people who have left
              </label>
            ) : null}
          </Toolbar>
        ) : null}
      </div>

      {view === "readiness" ? (
        <ReadinessPanel />
      ) : isError ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : isPending ? (
        <div className="bo-table-wrap p-4" aria-busy="true">
          <Skeleton className="mb-3 h-10" />
          <Skeleton className="mb-3 h-10" />
          <Skeleton className="h-10" />
        </div>
      ) : data.items.length === 0 ? (
        <EmptyState
          icon={UserX}
          title={search || zoneId || view !== "all" ? "No drivers match your filter." : "No drivers yet."}
          description={search || zoneId || view !== "all" ? undefined : "Add the first one to give them a sign-in for the driver app."}
        />
      ) : (
        <div className="bo-table-wrap">
          <div className="bo-table-scroll">
            <table className="bo-table bo-rtable">
              <thead>
                <tr>
                  <th>Driver</th>
                  <th>Work email</th>
                  <th>Cleared for</th>
                  <th>Duty</th>
                  <th>Employment</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((d) => (
                  <DriverRow key={d.id} driver={d} />
                ))}
              </tbody>
            </table>
          </div>
          {/* nextCursor is consumed. 053 shipped a console that ignored its own, silently capping it
              at the newest 25 rows. Rendered only when there is somewhere to go. */}
          {cursors.length > 0 || data.nextCursor ? (
            <Pager
              summary={`${data.items.length} driver${data.items.length === 1 ? "" : "s"} · page ${cursors.length + 1}`}
              canBack={cursors.length > 0}
              canNext={Boolean(data.nextCursor)}
              onBack={() => setCursors((c) => c.slice(0, -1))}
              onNext={() => setCursors((c) => (data.nextCursor ? [...c, data.nextCursor] : c))}
            />
          ) : null}
        </div>
      )}
    </>
  );
}

function DriverRow({ driver: d }: { driver: AdminDriverListItem }) {
  const blocked = blockedSummary(d);
  const c = d.capabilitySummary;
  const what = c.functions.length === 2 ? "Collect + deliver" : c.functions[0] === "collection" ? "Collect" : "Deliver";
  const where = c.coversEveryZone ? "every zone" : `${c.total} grant${c.total === 1 ? "" : "s"}`;
  return (
    <tr>
      <td data-m="primary">
        <div className="flex items-center gap-3">
          <span className="bo-avatar bo-avatar--sq max-md:hidden" aria-hidden="true">
            {initialsOf(d.name)}
          </span>
          <div className="min-w-0">
            <Link to="/drivers/$driverId" params={{ driverId: d.id }} className="bo-link">
              {d.name}
            </Link>
            {/* A driver who cannot receive work says so here, on the register, before an
                order is affected. */}
            {blocked ? (
              <span className="bo-sub flex items-center gap-1 font-medium text-foreground">
                <CircleAlert aria-hidden="true" className="size-3 shrink-0" />
                {blocked}
              </span>
            ) : null}
          </div>
        </div>
      </td>
      <td data-m="meta" className="is-muted">
        {d.workEmail}
      </td>
      <td data-m="meta" data-label="Cleared for">
        {c.total === 0 ? (
          <span className="font-medium">Nothing yet</span>
        ) : (
          <>
            {what} <span className="text-muted-foreground">· {where}</span>
          </>
        )}
      </td>
      <td data-m="trail">
        {d.dutyState === "on_duty" ? <DotWord tone="busy">On duty</DotWord> : <DotWord tone="off">Off duty</DotWord>}
      </td>
      <td data-m="badge">
        <StatusWord tone={d.status === "active" ? "done" : d.status === "suspended" ? "problem" : "quiet"}>{STATUS_LABEL[d.status]}</StatusWord>
      </td>
    </tr>
  );
}
