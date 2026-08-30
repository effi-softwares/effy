import { useMemo, useState } from "react";

import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";

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
import type { AdminDriverListItem, DriverEmploymentStatus } from "@effy/shared-types";

import { useSessionRoles } from "@/features/auth/useSessionRoles";

import { CreateDriverDialog } from "./components/CreateDriverDialog";
import { DutyPanel } from "./components/DutyPanel";
import { canManageDrivers } from "./access";
import { BLOCKED_LABEL, STATUS_LABEL, type DriverListParams } from "./model";
import { driversListQuery, exceptionsQuery, zonesQuery } from "./queries";

const ALL = "all";

/**
 * The driver register (056 US1) — the front door of the driver console.
 *
 * ⚠ A TABLE, AND NO METRIC CARDS ANYWHERE (Principle V, no exception claimed). This screen is where
 * the dashboard instinct fires hardest: "drivers on duty", "unresolved exceptions", "uncovered
 * zones" as four tiles across the top is the obvious design and the constitution forbids it. The
 * outstanding-exception count below is a LABELLED FIGURE IN A SECTION HEADER — a sentence with a
 * number in it and a link to the rows, which is more useful than a tile because it takes you
 * somewhere.
 *
 * ⚠ STATUS IS CARRIED BY WORDING AND WEIGHT, NEVER BY HUE. The ramp is monochrome and inverts
 * between appearances; 041 removed `amber` used as a "warning" colour across shop-web for exactly
 * this reason. An expired licence is an ordinary fact, not an error state.
 */

function blockedSummary(d: AdminDriverListItem): string | null {
  if (d.blockedReasons.length === 0) return null;
  return d.blockedReasons.map((r) => BLOCKED_LABEL[r]).join(" · ");
}

const columns: ColumnDef<AdminDriverListItem>[] = [
  {
    accessorKey: "name",
    header: "Driver",
    cell: ({ row }) => (
      <div className="space-y-0.5">
        <Link
          to="/drivers/$driverId"
          params={{ driverId: row.original.id }}
          className="font-medium text-primary hover:underline"
        >
          {row.original.name}
        </Link>
        {/* ⚠ SC-009 — a driver who cannot receive work says so HERE, on the register, before an
            order is affected. The alternative discovery path is an order that quietly fails to
            move, hours later, in a place nobody is looking. */}
        {blockedSummary(row.original) ? (
          <p className="text-xs font-medium text-muted-foreground">
            {blockedSummary(row.original)}
          </p>
        ) : null}
      </div>
    ),
  },
  { accessorKey: "workEmail", header: "Work email" },
  {
    accessorKey: "zone",
    header: "Zone",
    cell: ({ row }) =>
      row.original.zone ?? <span className="text-muted-foreground">Not assigned</span>,
  },
  {
    accessorKey: "dutyState",
    header: "Duty",
    cell: ({ row }) =>
      row.original.dutyState === "on_duty" ? (
        <span className="font-medium">On duty</span>
      ) : (
        <span className="text-muted-foreground">Off duty</span>
      ),
  },
  {
    accessorKey: "status",
    header: "Employment",
    cell: ({ row }) => (
      <span className={row.original.status === "active" ? "" : "font-medium"}>
        {STATUS_LABEL[row.original.status]}
      </span>
    ),
  },
];

export function DriversListScreen() {
  const roles = useSessionRoles();
  const canManage = canManageDrivers(roles);

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string>(ALL);
  const [zoneId, setZoneId] = useState<string>(ALL);
  const [includeOffboarded, setIncludeOffboarded] = useState(false);
  /**
   * Keyset paging, so a stack rather than a page number.
   *
   * ⚠ A cursor list cannot jump to "page 5" — that is the trade for never showing an operator the
   * same driver twice. Changing a filter resets the stack, because a cursor minted under one filter
   * means nothing under another.
   */
  const [cursors, setCursors] = useState<string[]>([]);

  const params: DriverListParams = useMemo(
    () => ({
      q: search.trim() || undefined,
      status: status === ALL ? "" : (status as DriverEmploymentStatus),
      zoneId: zoneId === ALL ? undefined : zoneId,
      includeOffboarded,
      cursor: cursors[cursors.length - 1],
    }),
    [search, status, zoneId, includeOffboarded, cursors],
  );

  const { data, error, isPending, isError, refetch } = useQuery(driversListQuery(params));
  const zones = useQuery(zonesQuery());
  // The outstanding count only — the rows live on the Exceptions section of the profile and the
  // dedicated filter below.
  const exceptions = useQuery(exceptionsQuery({ resolved: "false" }));

  function resetPaging<T>(set: (v: T) => void) {
    return (v: T) => {
      set(v);
      setCursors([]);
    };
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold">Drivers</h1>
          <p className="text-muted-foreground">
            Everyone Effy employs to move packages — who they are, whether they can work, and what
            has gone wrong out on the road.
          </p>
        </div>
        {canManage ? <CreateDriverDialog /> : null}
      </div>

      {/* ⚠ FR-032 — the outstanding count is visible on entering the Drivers area, as a sentence
          that leads somewhere. NOT a metric card (Principle V). Rendered only when there is
          something outstanding: a permanent "0 unresolved" line is noise that trains people to skip
          the row it lives on. */}
      {exceptions.data && exceptions.data.outstandingCount > 0 ? (
        <p className="border-l-2 border-foreground py-1 pl-3 text-sm">
          <span className="font-semibold tabular-nums">{exceptions.data.outstandingCount}</span>{" "}
          unresolved {exceptions.data.outstandingCount === 1 ? "report" : "reports"} from the road —
          failed deliveries and packages missing at shops.{" "}
          <Link to="/drivers/exceptions" className="text-primary underline">
            Review them
          </Link>
        </p>
      ) : null}

      <DutyPanel />

      <section className="space-y-4">
        <h2 className="text-base font-semibold">Register</h2>

        <div className="flex flex-wrap items-center gap-3">
          <Input
            placeholder="Search by name or work email…"
            value={search}
            onChange={(e) => resetPaging(setSearch)(e.target.value)}
            className="max-w-sm"
          />
          <Select value={status} onValueChange={resetPaging(setStatus)}>
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All employed</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="suspended">Suspended</SelectItem>
              <SelectItem value="offboarded">Offboarded</SelectItem>
            </SelectContent>
          </Select>
          <Select value={zoneId} onValueChange={resetPaging(setZoneId)}>
            <SelectTrigger className="w-52">
              <SelectValue placeholder="Any zone" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Any zone</SelectItem>
              {(zones.data ?? []).map((z) => (
                <SelectItem key={z.id} value={z.id}>
                  {z.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {/* FR-005 — offboarded drivers are hidden by default; a register full of people who left
              is a register nobody reads. */}
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={includeOffboarded}
              onChange={(e) => resetPaging(setIncludeOffboarded)(e.target.checked)}
              className="size-4 accent-foreground"
            />
            Include people who have left
          </label>
        </div>

        {isError ? (
          <ErrorState error={error} onRetry={() => void refetch()} />
        ) : isPending ? (
          <p className="text-sm text-muted-foreground">Loading drivers…</p>
        ) : (
          <>
            <DataTable
              columns={columns}
              data={data.items}
              emptyMessage={
                search || status !== ALL || zoneId !== ALL
                  ? "No drivers match your filter."
                  : "No drivers yet. Add the first one to give them a sign-in for the driver app."
              }
            />
            {/* ⚠ nextCursor IS CONSUMED. 053 shipped a console that ignored its own, silently
                capping it at the newest 25 rows. Rendered only when there is somewhere to go. */}
            {cursors.length > 0 || data.nextCursor ? (
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">
                  {data.items.length} driver{data.items.length === 1 ? "" : "s"}
                  {cursors.length > 0 ? ` · page ${cursors.length + 1}` : ""}
                </span>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    disabled={cursors.length === 0}
                    onClick={() => setCursors((c) => c.slice(0, -1))}
                  >
                    Back
                  </Button>
                  <Button
                    variant="outline"
                    disabled={!data.nextCursor}
                    onClick={() =>
                      setCursors((c) => (data.nextCursor ? [...c, data.nextCursor] : c))
                    }
                  >
                    Next
                  </Button>
                </div>
              </div>
            ) : null}
          </>
        )}
      </section>
    </div>
  );
}
