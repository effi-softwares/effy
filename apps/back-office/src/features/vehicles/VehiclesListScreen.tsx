import { useMemo, useState } from "react";

import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";

import {
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@effy/design-system/ui";
import { DataTable, ErrorState } from "@effy/web-kit/console";
import type { VehicleListItem, VehicleStatus } from "@effy/shared-types";

import { useSessionRoles } from "@/features/auth/useSessionRoles";

import { CreateVehicleDialog } from "./components/CreateVehicleDialog";
import { canManageVehicles } from "./access";
import {
  BODY_TYPE_LABEL,
  COMPLIANCE_LABEL,
  OWNERSHIP_LABEL,
  refrigerationLabel,
  STATUS_LABEL,
  type VehicleListParams,
} from "./model";
import { vehiclesListQuery } from "./queries";

const ALL = "all";

/**
 * The vehicle register (061 US1) — the front door of the fleet.
 *
 * ⚠ A TABLE, NOT CARDS, AND NO METRIC TILES (Principle V, no exception claimed). The dashboard
 * instinct fires hard here — "6 vehicles · 4 compliant · 2 off road" — and it would be worse than
 * useless at ten vehicles: a tile that says "2 non-compliant" makes an operator hunt for WHICH two,
 * which is the question the table already answers in the row.
 *
 * ⚠ COMPLIANCE IS VISIBLE WITHOUT OPENING A RECORD (FR-009), and it NAMES the lapsed item. "Not
 * compliant" would send an operator into the record to find out what to renew.
 */
export function VehiclesListScreen() {
  const roles = useSessionRoles();
  const canManage = canManageVehicles(roles);

  const [status, setStatus] = useState<VehicleStatus | "">("");
  const [refrigeration, setRefrigeration] = useState<"chilled" | "frozen" | "">("");
  const [cursorStack, setCursorStack] = useState<string[]>([]);

  const params: VehicleListParams = useMemo(
    () => ({ status, refrigeration, cursor: cursorStack[cursorStack.length - 1] }),
    [status, refrigeration, cursorStack],
  );
  const query = useQuery(vehiclesListQuery(params));

  const columns = useMemo<ColumnDef<VehicleListItem>[]>(
    () => [
      {
        header: "Plate",
        accessorKey: "registrationPlate",
        cell: ({ row }) => (
          <Link
            to="/vehicles/$vehicleId"
            params={{ vehicleId: row.original.id }}
            className="font-medium tabular-nums text-primary hover:underline"
          >
            {row.original.registrationPlate}
          </Link>
        ),
      },
      {
        header: "Vehicle",
        cell: ({ row }) => (
          <span>
            {row.original.make} {row.original.model}
            <span className="ml-2 text-muted-foreground">
              {BODY_TYPE_LABEL[row.original.bodyType]}
            </span>
          </span>
        ),
      },
      {
        header: "Carries",
        cell: ({ row }) =>
          refrigerationLabel(row.original.canCarryChilled, row.original.canCarryFrozen),
      },
      {
        header: "Owner",
        cell: ({ row }) => OWNERSHIP_LABEL[row.original.ownership],
      },
      {
        header: "With",
        cell: ({ row }) =>
          row.original.currentHolderDriverId ? (
            <Link
              to="/drivers/$driverId"
              params={{ driverId: row.original.currentHolderDriverId }}
              className="text-primary hover:underline"
            >
              {row.original.currentHolderName}
            </Link>
          ) : (
            <span className="text-muted-foreground">Available</span>
          ),
      },
      {
        header: "Status",
        cell: ({ row }) => {
          const issues = row.original.complianceIssues;
          return (
            <span className="space-x-2">
              <span>{STATUS_LABEL[row.original.status]}</span>
              {issues.length > 0 ? (
                <span className="font-medium text-destructive">
                  {issues.map((i) => COMPLIANCE_LABEL[i]).join(" · ")}
                </span>
              ) : null}
            </span>
          );
        },
      },
    ],
    [],
  );

  if (query.isError) {
    return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  }

  const items = query.data?.items ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold">Vehicles</h1>
          <p className="text-sm text-muted-foreground">
            Every vehicle Effy runs, whoever owns it — what it carries, what is roadworthy, and who
            has it right now.
          </p>
        </div>
        {canManage ? <CreateVehicleDialog /> : null}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Select
          value={status === "" ? ALL : status}
          onValueChange={(v) => {
            setStatus(v === ALL ? "" : (v as VehicleStatus));
            setCursorStack([]);
          }}
        >
          <SelectTrigger className="w-[180px]" aria-label="Status">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>In the fleet</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="off_road">Off the road</SelectItem>
            <SelectItem value="retired">Retired</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={refrigeration === "" ? ALL : refrigeration}
          onValueChange={(v) => {
            setRefrigeration(v === ALL ? "" : (v as "chilled" | "frozen"));
            setCursorStack([]);
          }}
        >
          <SelectTrigger className="w-[180px]" aria-label="Refrigeration">
            <SelectValue placeholder="Refrigeration" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Any refrigeration</SelectItem>
            <SelectItem value="chilled">Carries chilled</SelectItem>
            <SelectItem value="frozen">Carries frozen</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {items.length === 0 && !query.isLoading ? (
        <p className="text-sm text-muted-foreground">
          No vehicles yet. Add one to record what Effy runs — until then, nothing can be issued to a
          driver.
        </p>
      ) : (
        <DataTable columns={columns} data={items} />
      )}

      {/* ⚠ nextCursor is CONSUMED, not merely returned. 053 shipped a console silently capped at the
          newest 25 rows because nothing read it. */}
      {(query.data?.nextCursor || cursorStack.length > 0) && (
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={cursorStack.length === 0}
            onClick={() => setCursorStack((s) => s.slice(0, -1))}
          >
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={!query.data?.nextCursor}
            onClick={() =>
              setCursorStack((s) => (query.data?.nextCursor ? [...s, query.data.nextCursor] : s))
            }
          >
            Next
          </Button>
        </div>
      )}
    </div>
  );
}
