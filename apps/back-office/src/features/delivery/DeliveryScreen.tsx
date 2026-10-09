import { useState } from "react";

import { useQuery } from "@tanstack/react-query";
import { useNavigate, useSearch } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { Plus } from "lucide-react";

import {
  Badge, Button, Input, Label,
  Tabs, TabsContent, TabsList, TabsTrigger,
} from "@effy/design-system/ui";
import { DataTable, ErrorState } from "@effy/web-kit/console";

import { sessionQuery } from "@/features/auth/queries";

import { canManageDelivery, canSwitchDeliveryModel } from "./access";
import { deliveryMutationError } from "./errorText";
import { DeliveryDaysPanel } from "./components/DeliveryDaysPanel";
import { SlotsPanel } from "./components/SlotsPanel";
import { CoveragePanel } from "./coverage/CoveragePanel";
import { GoLivePanel } from "./golive/GoLivePanel";
import { PricingPanel } from "./pricing/PricingPanel";
import {
  collectionRunsQuery, settingsQuery, useCreateCollectionRun,
  useDeleteCollectionRun, usePutSettings,
} from "./queries";

const TABS: readonly string[] = ["coverage", "pricing", "schedule", "slots", "days", "settings", "go-live"];

export function DeliveryScreen() {
  const { data: session } = useQuery(sessionQuery);
  const roles = session?.status === "signed-in" ? session.identity.roles : [];
  const canManage = canManageDelivery(roles);
  // 083 — the tab is in the URL, so the go-live checklist can link to the tab that fixes each item.
  const search = useSearch({ strict: false }) as { tab?: string };
  const navigate = useNavigate();
  const tab = TABS.includes(search.tab ?? "") ? search.tab! : "coverage";
  const goTo = (next: string) => void navigate({ to: "/delivery", search: { tab: next } });

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold">Delivery</h1>
        <p className="text-muted-foreground">
          Where Effy delivers, what delivery costs, delivery times and the hub. All of it is the
          platform's — no shop can set it.
        </p>
      </div>

      <Tabs value={tab} onValueChange={goTo}>
        <TabsList>
          <TabsTrigger value="coverage">Coverage</TabsTrigger>
          <TabsTrigger value="pricing">Pricing</TabsTrigger>
          <TabsTrigger value="schedule">Same-day</TabsTrigger>
          <TabsTrigger value="slots">Time slots</TabsTrigger>
          <TabsTrigger value="days">Delivery days</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
          <TabsTrigger value="go-live">Go-live</TabsTrigger>
        </TabsList>
        <TabsContent value="coverage" className="mt-4"><CoveragePanel canManage={canManage} /></TabsContent>
        <TabsContent value="pricing" className="mt-4"><PricingPanel canManage={canManage} /></TabsContent>
        <TabsContent value="schedule" className="mt-4"><SchedulePanel canManage={canManage} /></TabsContent>
        <TabsContent value="slots" className="mt-4"><SlotsPanel canManage={canManage} /></TabsContent>
        <TabsContent value="days" className="mt-4"><DeliveryDaysPanel canManage={canManage} /></TabsContent>
        <TabsContent value="settings" className="mt-4"><SettingsPanel canManage={canManage} /></TabsContent>
        <TabsContent value="go-live" className="mt-4"><GoLivePanel canSwitch={canSwitchDeliveryModel(roles)} onGoToTab={goTo} /></TabsContent>
      </Tabs>
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

/** What a hub move did to the coverage list's distances (076 FR-012), in words. */
export function hubMoveSummary(d: { recomputed: number; unchanged: number; manualFlagged: number }): string {
  const parts = [`${d.recomputed} distance${d.recomputed === 1 ? "" : "s"} recalculated`];
  if (d.manualFlagged > 0) parts.push(`${d.manualFlagged} entered by hand flagged for review`);
  return `The hub moved: ${parts.join(", ")}.`;
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
      const saved = await put.mutateAsync({ hubLatitude: lat.trim(), hubLongitude: lng.trim(), samedayPrepBufferMin: Number(buffer) });
      setNote(saved.distances ? `Saved. ${hubMoveSummary(saved.distances)}` : "Saved.");
    } catch (err) {
      setNote(deliveryMutationError(err));
    }
  }

  if (settings.isError) return <ErrorState error={settings.error} onRetry={() => void settings.refetch()} />;

  return (
    <form onSubmit={submit} className="max-w-md space-y-4">
      <p className="text-sm text-muted-foreground">
        The hub is where every postcode's distance is measured from. Moving it recalculates the
        distances the platform worked out, and flags the ones entered by hand for another look. The prep
        buffer is how long a shop needs before a collection run.
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
