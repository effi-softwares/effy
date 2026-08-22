import { useMemo, useState } from "react";

import { useQuery } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { Plus } from "lucide-react";

import type { FeePlanDTO, RingDTO, ZoneDTO } from "@effy/shared-types";
import {
  Badge, Button, Input, Label, Switch,
  Tabs, TabsContent, TabsList, TabsTrigger,
} from "@effy/design-system/ui";
import { DataTable, ErrorState } from "@effy/web-kit/console";

import { sessionQuery } from "@/features/auth/queries";

import { canManageDelivery } from "./access";
import { deliveryMutationError, PLAN_INCOMPLETE } from "./errorText";
import { AddPostcodeDialog } from "./components/AddPostcodeDialog";
import { NewPlanDialog } from "./components/NewPlanDialog";
import { NewRingDialog } from "./components/NewRingDialog";
import { NewZoneDialog } from "./components/NewZoneDialog";
import { SameDayExceptionsDialog } from "./components/SameDayExceptionsDialog";
import {
  collectionRunsQuery, plansQuery, ringsQuery, settingsQuery, useActivatePlan, useCreateCollectionRun,
  useDeleteCollectionRun, usePatchZone, usePutSettings, useSuggestRing, zonesQuery,
} from "./queries";

export function DeliveryScreen() {
  const { data: session } = useQuery(sessionQuery);
  const roles = session?.status === "signed-in" ? session.identity.roles : [];
  const canManage = canManageDelivery(roles);

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold">Delivery</h1>
        <p className="text-muted-foreground">
          Served zones, distance rings, shipping-fee plans, and the collection hub. Fees are the
          platform's — no shop can set them.
        </p>
      </div>

      <Tabs defaultValue="zones">
        <TabsList>
          <TabsTrigger value="zones">Zones</TabsTrigger>
          <TabsTrigger value="rings">Rings</TabsTrigger>
          <TabsTrigger value="plans">Fee plans</TabsTrigger>
          <TabsTrigger value="schedule">Same-day</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>
        <TabsContent value="zones" className="mt-4"><ZonesPanel canManage={canManage} /></TabsContent>
        <TabsContent value="rings" className="mt-4"><RingsPanel canManage={canManage} /></TabsContent>
        <TabsContent value="plans" className="mt-4"><PlansPanel canManage={canManage} /></TabsContent>
        <TabsContent value="schedule" className="mt-4"><SchedulePanel canManage={canManage} /></TabsContent>
        <TabsContent value="settings" className="mt-4"><SettingsPanel canManage={canManage} /></TabsContent>
      </Tabs>
    </div>
  );
}

function ZonesPanel({ canManage }: { canManage: boolean }) {
  const zones = useQuery(zonesQuery());
  const rings = useQuery(ringsQuery());
  const patch = usePatchZone();
  const suggest = useSuggestRing();
  const [createOpen, setCreateOpen] = useState(false);
  const [addZone, setAddZone] = useState<ZoneDTO | null>(null);
  const [exceptionsZone, setExceptionsZone] = useState<ZoneDTO | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const ringName = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of rings.data ?? []) m.set(r.id, r.code);
    return (id: string | null) => (id ? (m.get(id) ?? "—") : "—");
  }, [rings.data]);

  async function onSuggest(zoneId: string) {
    setNote(null);
    try {
      const s = await suggest.mutateAsync(zoneId);
      setNote(s.reason === "no_coordinate"
        ? "No coordinate for that zone yet — assign a ring by hand."
        : `Suggested ${ringName(s.ringId)} (~${s.hubDistanceKm} km from the hub).`);
    } catch (err) {
      setNote(deliveryMutationError(err));
    }
  }

  const columns: ColumnDef<ZoneDTO>[] = [
    { accessorKey: "code", header: "Code", cell: ({ row }) => <span className="font-mono">{row.original.code}</span> },
    { accessorKey: "name", header: "Name" },
    { id: "ring", header: "Ring", cell: ({ row }) => ringName(row.original.ringId) },
    { accessorKey: "postcodeCount", header: "Postcodes", cell: ({ row }) => <span className="tabular-nums">{row.original.postcodeCount}</span> },
    {
      id: "sameday", header: "Same-day",
      cell: ({ row }) => (
        <Switch
          checked={row.original.samedayEligible}
          disabled={!canManage || patch.isPending}
          onCheckedChange={(v) => patch.mutate({ zoneId: row.original.id, body: { samedayEligible: v } })}
        />
      ),
    },
    {
      id: "actions", header: "",
      cell: ({ row }) => canManage ? (
        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={() => setAddZone(row.original)}>Add postcode</Button>
          <Button variant="outline" size="sm" disabled={suggest.isPending} onClick={() => void onSuggest(row.original.id)}>
            Suggest ring
          </Button>
          <Button variant="outline" size="sm" onClick={() => setExceptionsZone(row.original)}>Same-day…</Button>
        </div>
      ) : null,
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">A postcode belongs to at most one zone. Same-day is offered per zone (all shops by default).</p>
        {canManage ? <Button onClick={() => setCreateOpen(true)}><Plus /> New zone</Button> : null}
      </div>
      {note ? <p className="text-sm">{note}</p> : null}
      {zones.isError ? <ErrorState error={zones.error} onRetry={() => void zones.refetch()} />
        : zones.isPending ? <p className="text-sm text-muted-foreground">Loading…</p>
        : <DataTable columns={columns} data={zones.data} emptyMessage="No zones yet — create one to start serving." />}
      <NewZoneDialog open={createOpen} onOpenChange={setCreateOpen} />
      {addZone ? (
        <AddPostcodeDialog zoneId={addZone.id} zoneName={addZone.name} open={addZone != null}
          onOpenChange={(o) => { if (!o) setAddZone(null); }} />
      ) : null}
      {exceptionsZone ? (
        <SameDayExceptionsDialog
          zoneId={exceptionsZone.id}
          zoneName={exceptionsZone.name}
          zoneEligible={exceptionsZone.samedayEligible}
          open={exceptionsZone != null}
          onOpenChange={(o) => { if (!o) setExceptionsZone(null); }}
        />
      ) : null}
    </div>
  );
}

function SchedulePanel({ canManage }: { canManage: boolean }) {
  const runs = useQuery(collectionRunsQuery());
  const create = useCreateCollectionRun();
  const del = useDeleteCollectionRun();
  const [runTime, setRunTime] = useState("");
  const [label, setLabel] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await create.mutateAsync({ runTime: runTime.trim(), label: label.trim() || null });
      setRunTime(""); setLabel("");
    } catch (err) {
      setError(deliveryMutationError(err));
    }
  }

  return (
    <div className="max-w-xl space-y-4">
      <p className="text-sm text-muted-foreground">
        Effy's drivers collect from shops on these runs (Australia/Melbourne). Same-day is offered while a
        run is still makeable today, allowing the prep buffer set in Settings. One run behaves as a single
        daily cutoff; several extend availability through the day.
      </p>
      {runs.isError ? (
        <ErrorState error={runs.error} onRetry={() => void runs.refetch()} />
      ) : runs.isPending ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : runs.data.length === 0 ? (
        <p className="text-sm text-muted-foreground">No runs yet — same-day is offered nowhere until one is added.</p>
      ) : (
        <ul className="divide-y rounded-md border">
          {runs.data.map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
              <span className="font-mono font-medium tabular-nums">{r.runTime}</span>
              <span className="min-w-0 flex-1 truncate text-muted-foreground">{r.label ?? ""}</span>
              {canManage ? (
                <Button variant="ghost" size="sm" onClick={() => void del.mutateAsync(r.id)}>Remove</Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {canManage ? (
        <form onSubmit={add} className="flex items-end gap-2 border-t pt-4">
          <div className="space-y-2">
            <Label htmlFor="run-time">Run time (HH:MM)</Label>
            <Input id="run-time" className="w-32" placeholder="14:00" value={runTime} onChange={(e) => setRunTime(e.target.value)} />
          </div>
          <div className="flex-1 space-y-2">
            <Label htmlFor="run-label">Label (optional)</Label>
            <Input id="run-label" placeholder="Afternoon run" value={label} onChange={(e) => setLabel(e.target.value)} />
          </div>
          <Button type="submit" disabled={create.isPending || !runTime.trim()}>Add run</Button>
        </form>
      ) : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}

function RingsPanel({ canManage }: { canManage: boolean }) {
  const rings = useQuery(ringsQuery());
  const [open, setOpen] = useState(false);
  const columns: ColumnDef<RingDTO>[] = [
    { accessorKey: "ordinal", header: "Order", cell: ({ row }) => <span className="tabular-nums">{row.original.ordinal}</span> },
    { accessorKey: "code", header: "Code", cell: ({ row }) => <span className="font-mono">{row.original.code}</span> },
    { accessorKey: "name", header: "Name" },
    { id: "upper", header: "Upper km", cell: ({ row }) => row.original.suggestUpperKm ?? "furthest (open-ended)" },
    { accessorKey: "status", header: "Status" },
  ];
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Distance tiers, ordered nearest→furthest. The fee's distance factor is priced per ring.</p>
        {canManage ? <Button onClick={() => setOpen(true)}><Plus /> New ring</Button> : null}
      </div>
      {rings.isError ? <ErrorState error={rings.error} onRetry={() => void rings.refetch()} />
        : rings.isPending ? <p className="text-sm text-muted-foreground">Loading…</p>
        : <DataTable columns={columns} data={rings.data} emptyMessage="No rings yet." />}
      <NewRingDialog open={open} onOpenChange={setOpen} />
    </div>
  );
}

function PlansPanel({ canManage }: { canManage: boolean }) {
  const plans = useQuery(plansQuery());
  const activate = useActivatePlan();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  async function onActivate(id: string) {
    setNote(null);
    try {
      await activate.mutateAsync(id);
      setNote("Plan activated. New quotes use it; already-quoted orders keep their fee.");
    } catch (err) {
      setNote(deliveryMutationError(err, PLAN_INCOMPLETE));
    }
  }

  const columns: ColumnDef<FeePlanDTO>[] = [
    {
      accessorKey: "name", header: "Name",
      cell: ({ row }) => (
        <span className="flex items-center gap-2">
          {row.original.name}
          {row.original.isActive ? <Badge>Active</Badge> : null}
        </span>
      ),
    },
    { id: "std", header: "Standard ×", cell: ({ row }) => row.original.standardFactor },
    { id: "same", header: "Same-day ×", cell: ({ row }) => row.original.sameDayFactor },
    { id: "grid", header: "Step / floor / cap", cell: ({ row }) => `${row.original.roundingStep} / ${row.original.floorAmount} / ${row.original.capAmount}` },
    {
      id: "actions", header: "",
      cell: ({ row }) => canManage && !row.original.isActive ? (
        <div className="flex justify-end">
          <Button variant="outline" size="sm" disabled={activate.isPending} onClick={() => void onActivate(row.original.id)}>
            Activate
          </Button>
        </div>
      ) : null,
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Exactly one plan is active. Activation is refused unless the plan can price every served zone.</p>
        {canManage ? <Button onClick={() => setOpen(true)}><Plus /> New plan</Button> : null}
      </div>
      {note ? <p className="text-sm">{note}</p> : null}
      {plans.isError ? <ErrorState error={plans.error} onRetry={() => void plans.refetch()} />
        : plans.isPending ? <p className="text-sm text-muted-foreground">Loading…</p>
        : <DataTable columns={columns} data={plans.data} emptyMessage="No fee plans yet." />}
      <NewPlanDialog open={open} onOpenChange={setOpen} />
    </div>
  );
}

function SettingsPanel({ canManage }: { canManage: boolean }) {
  const settings = useQuery(settingsQuery());
  const put = usePutSettings();
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [buffer, setBuffer] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  // Seed the form once from the server value.
  if (settings.data && !loaded) {
    setLat(settings.data.hubLatitude ?? "");
    setLng(settings.data.hubLongitude ?? "");
    setBuffer(settings.data.samedayPrepBufferMin != null ? String(settings.data.samedayPrepBufferMin) : "");
    setLoaded(true);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setNote(null);
    try {
      await put.mutateAsync({ hubLatitude: lat.trim(), hubLongitude: lng.trim(), samedayPrepBufferMin: Number(buffer) });
      setNote("Saved.");
    } catch (err) {
      setNote(deliveryMutationError(err));
    }
  }

  if (settings.isError) return <ErrorState error={settings.error} onRetry={() => void settings.refetch()} />;

  return (
    <form onSubmit={submit} className="max-w-md space-y-4">
      <p className="text-sm text-muted-foreground">
        The operating hub is where ring distances are measured from. The prep buffer is how long a shop
        needs before a collection run.
      </p>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="hub-lat">Hub latitude</Label>
          <Input id="hub-lat" inputMode="decimal" value={lat} onChange={(e) => setLat(e.target.value)} placeholder="-37.8142" disabled={!canManage} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="hub-lng">Hub longitude</Label>
          <Input id="hub-lng" inputMode="decimal" value={lng} onChange={(e) => setLng(e.target.value)} placeholder="144.9632" disabled={!canManage} />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="buffer">Same-day prep buffer (minutes)</Label>
        <Input id="buffer" inputMode="numeric" value={buffer} onChange={(e) => setBuffer(e.target.value)} placeholder="60" disabled={!canManage} />
      </div>
      {note ? <p className="text-sm">{note}</p> : null}
      {canManage ? <Button type="submit" disabled={put.isPending}>Save settings</Button> : null}
    </form>
  );
}
