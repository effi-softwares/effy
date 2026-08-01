import { useMemo, useState } from "react";

import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { ArrowLeft, MapPin } from "lucide-react";

import type { DeliveryMethod, DeliveryStatus } from "@effy/shared-types";
import {
  Badge,
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@effy/design-system/ui";
import { DataTable, ErrorState } from "@effy/web-kit/console";

import { sessionQuery } from "@/features/auth/queries";

import { canManageDelivery } from "./access";
import { SetShopLocationDialog } from "./components/SetShopLocationDialog";
import type { Offering } from "./model";
import { offeringListQuery, zoneListQuery } from "./queries";

const PAGE_SIZE = 50;
const ALL_ZONES = "all";

const METHOD_LABELS: Record<DeliveryMethod, string> = {
  same_day: "Same-day",
  scheduled: "Scheduled",
  standard: "Standard",
};

function StatusBadge({ status }: { status: DeliveryStatus }) {
  return <Badge variant={status === "active" ? "success" : "muted"}>{status}</Badge>;
}

function windowLabel(o: Offering): string {
  if (o.method === "same_day") return o.sameDayCutoff ? `Today (by ${o.sameDayCutoff})` : "Today";
  if (o.leadDaysMin === o.leadDaysMax) return `${o.leadDaysMin} day${o.leadDaysMin === 1 ? "" : "s"}`;
  return `${o.leadDaysMin}–${o.leadDaysMax} days`;
}

export function RatesScreen() {
  const { data: session } = useQuery(sessionQuery);
  const roles = session?.status === "signed-in" ? session.identity.roles : [];
  const canManage = canManageDelivery(roles);

  const [origin, setOrigin] = useState<string>(ALL_ZONES);
  const [destination, setDestination] = useState<string>(ALL_ZONES);
  const [locationOpen, setLocationOpen] = useState(false);

  const zonesQuery = useQuery(zoneListQuery({ page: 1, pageSize: 100 }));
  const zones = zonesQuery.data?.items ?? [];

  const params = useMemo(
    () => ({
      page: 1,
      pageSize: PAGE_SIZE,
      originZoneId: origin === ALL_ZONES ? undefined : origin,
      destinationZoneId: destination === ALL_ZONES ? undefined : destination,
    }),
    [origin, destination],
  );

  const { data, error, isPending, isError, refetch } = useQuery(offeringListQuery(params));

  const columns = useMemo<ColumnDef<Offering>[]>(() => {
    const base: ColumnDef<Offering>[] = [
      { accessorKey: "originZoneName", header: "Origin" },
      { accessorKey: "destinationZoneName", header: "Destination" },
      {
        accessorKey: "method",
        header: "Method",
        cell: ({ row }) => METHOD_LABELS[row.original.method],
      },
      {
        accessorKey: "priceAmount",
        header: "Price",
        cell: ({ row }) => <span className="tabular-nums">${row.original.priceAmount}</span>,
      },
      { id: "window", header: "Window", cell: ({ row }) => windowLabel(row.original) },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => <StatusBadge status={row.original.status} />,
      },
    ];
    // ⚠ 031 T039a: NO edit control. This grid is now READ-ONLY.
    //
    // It remains for visibility and diagnosis — it is still the truth about what the platform will
    // quote — but writing happens on the AREA screen. Leaving both editable would mean two management
    // surfaces for one concept, which is what the spec's own reasoning rejects: a per-origin edit here
    // would silently undo the one-fee-per-area rule (FR-013/SC-011) the day after sign-off.
    return base;
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <Button variant="ghost" size="sm" asChild>
          <Link to="/delivery-zones">
            <ArrowLeft />
            All zones
          </Link>
        </Button>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold">Rates &amp; shop locations</h1>
          <p className="text-muted-foreground">
            The per-(origin → destination, method) rate grid, and each shop's origin postcode.
            <span className="mt-1 block">
              ⚠ Read-only. Fees and service levels are set per <strong>area</strong> — open a zone and
              choose an area to change them.
            </span>
          </p>
        </div>
        {canManage ? (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setLocationOpen(true)}>
              <MapPin />
              Set shop location
            </Button>
          </div>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <ZoneFilter label="Origin" value={origin} onChange={setOrigin} zones={zones} />
        <ZoneFilter label="Destination" value={destination} onChange={setDestination} zones={zones} />
      </div>

      {isError ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : isPending ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <DataTable columns={columns} data={data.items} emptyMessage="No rates match your filter." />
      )}

      {canManage ? (
        <>
          {/* ⚠ The offering dialogs are GONE (031 T039a). Rates are written per AREA, and two
              management surfaces for one concept is how configuration drifts — a per-origin edit here
              would silently undo the one-fee-per-area rule (FR-013/SC-011). This screen remains the
              truth about what the platform will quote; it is simply no longer where you change it. */}
          <SetShopLocationDialog open={locationOpen} onOpenChange={setLocationOpen} />
        </>
      ) : null}
    </div>
  );
}

function ZoneFilter({
  label,
  value,
  onChange,
  zones,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  zones: { id: string; name: string }[];
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-52">
        <SelectValue placeholder={label} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL_ZONES}>{label}: all</SelectItem>
        {zones.map((z) => (
          <SelectItem key={z.id} value={z.id}>
            {z.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
