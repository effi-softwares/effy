import { useMemo, useState } from "react";

import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { CircleAlert, Truck } from "lucide-react";

import { cn } from "@effy/design-system";
import { Checkbox, Skeleton } from "@effy/design-system/ui";
import { ErrorState } from "@effy/web-kit/console";
import type { VehicleListItem, VehicleOwnership, VehicleStatus } from "@effy/shared-types";

import { PageHeader } from "@effy/web-kit/patterns";
import { EmptyState } from "@effy/web-kit/patterns";
import { StatusWord } from "@effy/web-kit/patterns";
import { Facet, Pager, ResetFilters, SearchBox, Toolbar, ToolbarSpacer } from "@effy/web-kit/patterns";
import { useSessionRoles } from "@/features/auth/useSessionRoles";

import { CreateVehicleDialog } from "./components/CreateVehicleDialog";
import { canManageVehicles } from "./access";
import { BODY_TYPE_LABEL, COMPLIANCE_LABEL, OWNERSHIP_LABEL, refrigerationLabel, STATUS_LABEL, type VehicleListParams } from "./model";
import { vehiclesListQuery } from "./queries";

type View = "all" | VehicleStatus;
const VIEWS: readonly { key: View; label: string }[] = [
  { key: "all", label: "In the fleet" },
  { key: "active", label: "Active" },
  { key: "off_road", label: "Off the road" },
  { key: "retired", label: "Retired" },
];

/**
 * The vehicle register: a table, no metric tiles. Compliance shows without opening a record, naming the
 * lapsed item.
 */
export function VehiclesListScreen() {
  const roles = useSessionRoles();
  const canManage = canManageVehicles(roles);

  const [view, setView] = useState<View>("all");
  const [refrigeration, setRefrigeration] = useState<"chilled" | "frozen" | null>(null);
  const [owner, setOwner] = useState<VehicleOwnership | null>(null);
  const [nonCompliantOnly, setNonCompliantOnly] = useState(false);
  const [search, setSearch] = useState("");
  const [cursorStack, setCursorStack] = useState<string[]>([]);

  const params: VehicleListParams = useMemo(
    () => ({
      status: view === "all" ? "" : view,
      refrigeration: refrigeration ?? "",
      nonCompliantOnly,
      cursor: cursorStack[cursorStack.length - 1],
    }),
    [view, refrigeration, nonCompliantOnly, cursorStack],
  );
  const query = useQuery(vehiclesListQuery(params));

  function reset<T>(set: (v: T) => void) {
    return (v: T) => {
      set(v);
      setCursorStack([]);
    };
  }

  // Search and owner narrow the page on screen; the register is a few dozen vehicles at most.
  const items = (query.data?.items ?? []).filter((v) => {
    if (owner && v.ownership !== owner) return false;
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return `${v.registrationPlate} ${v.make} ${v.model}`.toLowerCase().includes(q);
  });
  const filtered = Boolean(search || owner || refrigeration || nonCompliantOnly);

  return (
    <>
      <PageHeader
        title="Vehicles"
        description="The vans and cars drivers use, their capacity, roadworthiness, and who has each one."
        actions={canManage ? <CreateVehicleDialog /> : undefined}
      />

      <div className="space-y-3">
        <nav className="bo-tabs" aria-label="Vehicle views">
          {VIEWS.map((v) => (
            <button
              key={v.key}
              type="button"
              aria-current={v.key === view ? "page" : undefined}
              className={cn("bo-tabs__tab", v.key === view && "is-active")}
              onClick={() => reset(setView)(v.key)}
            >
              {v.label}
            </button>
          ))}
        </nav>
        <Toolbar>
          <SearchBox label="Search vehicles" placeholder="Plate, make or model…" value={search} onChange={setSearch} />
          <Facet
            label="Refrigeration"
            value={refrigeration}
            onChange={reset(setRefrigeration)}
            options={[
              { value: "chilled", label: "Carries chilled" },
              { value: "frozen", label: "Carries frozen" },
            ]}
          />
          <Facet
            label="Owner"
            value={owner}
            onChange={setOwner}
            options={(Object.keys(OWNERSHIP_LABEL) as VehicleOwnership[]).map((o) => ({ value: o, label: OWNERSHIP_LABEL[o] }))}
          />
          {filtered ? (
            <ResetFilters
              onReset={() => {
                setSearch("");
                setOwner(null);
                setRefrigeration(null);
                setNonCompliantOnly(false);
                setCursorStack([]);
              }}
            />
          ) : null}
          <ToolbarSpacer />
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={nonCompliantOnly} onCheckedChange={(v) => reset(setNonCompliantOnly)(v === true)} />
            Non-compliant only
          </label>
        </Toolbar>
      </div>

      {query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : query.isPending ? (
        <div className="bo-table-wrap p-4" aria-busy="true">
          <Skeleton className="mb-3 h-10" />
          <Skeleton className="mb-3 h-10" />
          <Skeleton className="h-10" />
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={Truck}
          title={filtered || view !== "all" ? "No vehicles match your filter." : "No vehicles yet."}
          description={
            filtered || view !== "all"
              ? undefined
              : "Add one to record what Effy runs — until then, nothing can be issued to a driver."
          }
        />
      ) : (
        <div className="bo-table-wrap">
          <div className="bo-table-scroll">
            <table className="bo-table bo-rtable">
              <thead>
                <tr>
                  <th>Plate</th>
                  <th>Vehicle</th>
                  <th>Carries</th>
                  <th>Owner</th>
                  <th>With</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {items.map((v) => (
                  <VehicleRow key={v.id} vehicle={v} />
                ))}
              </tbody>
            </table>
          </div>
          {/* nextCursor is consumed, not merely returned (053 shipped a console capped at 25). */}
          {query.data.nextCursor || cursorStack.length > 0 ? (
            <Pager
              summary={`${items.length} vehicle${items.length === 1 ? "" : "s"} · page ${cursorStack.length + 1}`}
              canBack={cursorStack.length > 0}
              canNext={Boolean(query.data.nextCursor)}
              onBack={() => setCursorStack((s) => s.slice(0, -1))}
              onNext={() => setCursorStack((s) => (query.data.nextCursor ? [...s, query.data.nextCursor] : s))}
            />
          ) : null}
        </div>
      )}
    </>
  );
}

export function vehicleStatusTone(s: VehicleStatus) {
  return s === "active" ? ("done" as const) : s === "off_road" ? ("problem" as const) : ("quiet" as const);
}

function VehicleRow({ vehicle: v }: { vehicle: VehicleListItem }) {
  const issues = v.complianceIssues;
  return (
    <tr>
      <td data-m="primary">
        <Link to="/vehicles/$vehicleId" params={{ vehicleId: v.id }} className="bo-link bo-code">
          {v.registrationPlate}
        </Link>
      </td>
      <td data-m="meta">
        {v.make} {v.model}
        <div className="bo-sub">{BODY_TYPE_LABEL[v.bodyType]}</div>
      </td>
      <td data-m="meta" data-label="Carries">
        {refrigerationLabel(v.canCarryChilled, v.canCarryFrozen)}
      </td>
      <td data-m="meta" className="is-muted">
        {OWNERSHIP_LABEL[v.ownership]}
      </td>
      <td data-m="trail">
        {v.currentHolderDriverId ? (
          <Link to="/drivers/$driverId" params={{ driverId: v.currentHolderDriverId }} className="bo-link">
            {v.currentHolderName}
          </Link>
        ) : (
          <span className="text-muted-foreground">Available</span>
        )}
      </td>
      <td data-m="badge">
        <StatusWord tone={vehicleStatusTone(v.status)}>{STATUS_LABEL[v.status]}</StatusWord>
        {issues.length > 0 ? (
          <span className="bo-sub mt-1 flex items-center gap-1 font-medium text-foreground">
            <CircleAlert aria-hidden="true" className="size-3 shrink-0" />
            {issues.map((i) => COMPLIANCE_LABEL[i]).join(" · ")}
          </span>
        ) : null}
      </td>
    </tr>
  );
}
