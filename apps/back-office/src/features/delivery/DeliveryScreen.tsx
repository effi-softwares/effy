import { useState } from "react";

import { useQuery } from "@tanstack/react-query";
import { useSearch } from "@tanstack/react-router";

import { Button, Input, Label } from "@effy/design-system/ui";
import { ErrorState } from "@effy/web-kit/console";

import { PageHeader } from "@/components/patterns/Page";
import { Panel } from "@/components/patterns/Panel";

import { sessionQuery } from "@/features/auth/queries";

import { canManageDelivery } from "./access";
import { deliveryMutationError } from "./errorText";
import { DeliveryDaysPanel } from "./components/DeliveryDaysPanel";
import { SlotsPanel } from "./components/SlotsPanel";
import { CoveragePanel, CourierPage } from "./coverage/CoveragePanel";
import { PricingPanel } from "./pricing/PricingPanel";
import {
  collectionRunsQuery, settingsQuery, useCreateCollectionRun,
  useDeleteCollectionRun, usePutSettings,
} from "./queries";

const TABS: readonly string[] = ["coverage", "courier", "pricing", "slots", "days", "schedule", "settings"];

/** The page each sidebar entry opens (redesign, folder "Delivery settings"): its title and its one line. */
const PAGES: Record<string, { title: string; description: string }> = {
  pricing: {
    title: "Pricing",
    description: "What delivery costs. One fee per order, worked out from one plan — base, distance, weight, and a surcharge for a window today.",
  },
  slots: {
    title: "Delivery windows",
    description: "The daily windows a customer chooses from: their hours, their cut-off, and how many orders each can take.",
  },
  days: {
    title: "Days, runs and closures",
    description: "Which days Effy delivers, the collection runs that bring parcels to the hub, and the dates it is closed.",
  },
  settings: {
    title: "Hub and timings",
    description: "Where every distance is measured from, and how long a shop needs before a collection run.",
  },
};

export function DeliveryScreen() {
  const { data: session } = useQuery(sessionQuery);
  const roles = session?.status === "signed-in" ? session.identity.roles : [];
  const canManage = canManageDelivery(roles);
  const search = useSearch({ strict: false }) as { tab?: string };
  const raw = TABS.includes(search.tab ?? "") ? search.tab! : "coverage";
  // Collection runs live on the Days page now.
  const tab = raw === "schedule" ? "days" : raw;

  if (tab === "coverage") return <CoveragePanel canManage={canManage} />;
  if (tab === "courier") return <CourierPage canManage={canManage} />;

  const page = PAGES[tab]!;
  return (
    <>
      <PageHeader title={page.title} description={page.description} />
      <div className="bo-settings">
      {tab === "pricing" ? (
        <PricingPanel canManage={canManage} />
      ) : tab === "slots" ? (
        <SlotsPanel canManage={canManage} />
      ) : tab === "days" ? (
        <>
          <DeliveryDaysPanel canManage={canManage} />
          <SchedulePanel canManage={canManage} />
        </>
      ) : (
        <SettingsPanel canManage={canManage} />
      )}
      </div>
    </>
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
    <Panel
      title="Collection runs"
      description="Effy's drivers collect from shops on these runs (Melbourne time). A window today is offered while a run can still be made and reaches the hub before the window starts, allowing the prep buffer set in Hub and timings."
      flush
    >
      <div className="space-y-4 px-5 py-4">
      {runs.isError ? (
        <ErrorState error={runs.error} onRetry={() => void runs.refetch()} />
      ) : runs.isPending ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : runs.data.length === 0 ? (
        <p className="text-sm text-muted-foreground">No runs yet — no delivery window today can be offered until one is added.</p>
      ) : (
        <ul className="divide-y divide-border rounded-md border border-border">
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
        <form onSubmit={add} className="flex flex-wrap items-end gap-2 border-t border-border pt-4">
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
      {error ? <p role="alert" className="text-sm font-medium">{error}</p> : null}
      </div>
    </Panel>
  );
}

/** What a hub move did to the coverage list's distances, in words. */
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
    <form onSubmit={submit} className="max-w-2xl">
      <Panel
        title="The hub"
        description="Every postcode's distance is measured from here. Moving it recalculates the distances the platform worked out, and flags the ones entered by hand for another look."
        footerBetween
        footer={
          <>
            <span className="bo-sub" role="status">{note ?? "The prep buffer is how long a shop needs before a collection run."}</span>
            {canManage ? <Button type="submit" disabled={put.isPending}>Save settings</Button> : null}
          </>
        }
      >
      <div className="space-y-4">
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
        <Label htmlFor="buffer">Shop prep buffer (minutes)</Label>
        <Input id="buffer" inputMode="numeric" value={buffer} onChange={(e) => setBuffer(e.target.value)} placeholder="60" disabled={!canManage} />
      </div>
      </div>
      </Panel>
    </form>
  );
}
