import { useState } from "react";

import type { CoverageGroupDTO, CoveragePlaceResultDTO } from "@effy/shared-types";
import {
  Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, Input, Label,
} from "@effy/design-system/ui";

import { coverageError, isNoDriverCovers, NO_DRIVER_GROUP, NO_DRIVER_UNGROUPED } from "../errorText";
import { useAddCoveragePostcodes } from "../queries";
import { searchCoveragePlaces } from "../repo";

const SELECT = "h-9 w-full rounded-md border border-input bg-background px-3 text-sm";

/**
 * Add places to Effy's delivery area (076 US1) — by NAME. Nobody types a postcode or a distance for
 * a place the platform can locate.
 *
 * What gets listed is the POSTCODE, so each result shows every place that comes with it (FR-003),
 * and two places of one name are told apart by state and postcode (FR-002). A postcode with no
 * located place asks for its distance; one already listed cannot be picked again.
 */
export function AddPlacesDialog({
  open, onOpenChange, groups,
}: { open: boolean; onOpenChange: (o: boolean) => void; groups: CoverageGroupDTO[] }) {
  const add = useAddCoveragePostcodes();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<CoveragePlaceResultDTO[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [picked, setPicked] = useState<Map<string, CoveragePlaceResultDTO>>(new Map());
  const [manual, setManual] = useState<Record<string, string>>({});
  const [groupId, setGroupId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [askNoDrivers, setAskNoDrivers] = useState(false);

  function reset() {
    setQ(""); setResults(null); setPicked(new Map()); setManual({}); setGroupId(""); setError(null); setAskNoDrivers(false);
  }

  async function search(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSearching(true);
    try {
      setResults((await searchCoveragePlaces(q.trim())).results);
    } catch (err) {
      setError(coverageError(err));
    } finally {
      setSearching(false);
    }
  }

  function toggle(r: CoveragePlaceResultDTO) {
    setPicked((m) => {
      const next = new Map(m);
      if (next.has(r.postcode)) next.delete(r.postcode);
      else next.set(r.postcode, r);
      return next;
    });
  }

  const chosen = [...picked.values()];
  const missingDistance = chosen.some((r) => r.computedDistanceKm === null && !(manual[r.postcode] ?? "").trim());

  async function submit(confirmNoDrivers = false) {
    setError(null);
    try {
      await add.mutateAsync({
        postcodes: chosen.map((r) => ({
          postcode: r.postcode,
          manualDistanceKm: r.computedDistanceKm === null ? (manual[r.postcode] ?? "").trim() : null,
        })),
        groupId: groupId || null,
        ...(confirmNoDrivers ? { confirmNoDrivers: true } : {}),
      });
      reset();
      onOpenChange(false);
    } catch (err) {
      if (isNoDriverCovers(err) && !confirmNoDrivers) setAskNoDrivers(true);
      else setError(coverageError(err));
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add places Effy delivers to</DialogTitle>
          <DialogDescription>
            Search a suburb or town. Delivery is decided by postcode, so every place sharing it is added with it.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <form onSubmit={search} className="flex items-end gap-2">
            <div className="flex-1 space-y-1.5">
              <Label htmlFor="add-place">Place or postcode</Label>
              <Input id="add-place" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Richmond" autoFocus />
            </div>
            <Button type="submit" variant="outline" disabled={searching || q.trim().length < 2}>Search</Button>
          </form>

          {results ? (
            results.length === 0 ? (
              <p className="text-sm text-muted-foreground" data-testid="add-none">No place by that name.</p>
            ) : (
              <ul className="max-h-64 divide-y overflow-y-auto rounded-md border text-sm" data-testid="add-results">
                {results.map((r) => (
                  <li key={r.postcode} className="px-3 py-2">
                    <label className="flex items-start gap-3">
                      <input type="checkbox" className="mt-1" disabled={r.listed} checked={picked.has(r.postcode)}
                        onChange={() => toggle(r)} aria-label={`${r.matched} ${r.state ?? ""} ${r.postcode}`} />
                      <span className="min-w-0 flex-1">
                        <span className="font-medium">{r.matched}</span>
                        <span className="text-muted-foreground"> · {r.state ?? "—"} · <span className="font-mono">{r.postcode}</span></span>
                        {r.listed ? <span className="ml-2 text-muted-foreground">Already on the list</span> : null}
                        <span className="block text-muted-foreground">
                          {r.places.length > 1 ? `Also brings ${r.places.filter((p) => p !== r.matched).slice(0, 6).join(", ")}${r.places.length > 7 ? "…" : ""}. ` : ""}
                          {r.computedDistanceKm !== null ? `${r.computedDistanceKm} km from the hub.` : "No known location — its distance must be entered."}
                        </span>
                      </span>
                    </label>
                    {picked.has(r.postcode) && r.computedDistanceKm === null ? (
                      <div className="ml-7 mt-2 flex items-center gap-2">
                        <Label htmlFor={`km-${r.postcode}`}>Distance from the hub (km)</Label>
                        <Input id={`km-${r.postcode}`} className="w-28" inputMode="decimal"
                          value={manual[r.postcode] ?? ""} onChange={(e) => setManual((m) => ({ ...m, [r.postcode]: e.target.value }))} />
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            )
          ) : null}

          {chosen.length > 0 ? (
            <div className="space-y-1.5">
              <Label htmlFor="add-group">Group (optional)</Label>
              <select id="add-group" className={SELECT} value={groupId} onChange={(e) => { setGroupId(e.target.value); setAskNoDrivers(false); }}>
                <option value="">No group</option>
                {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
            </div>
          ) : null}

          {askNoDrivers ? (
            <p className="rounded-md border border-warning bg-warning-soft px-3 py-2 text-sm" role="alert" data-testid="add-no-drivers">
              {groupId ? NO_DRIVER_GROUP : NO_DRIVER_UNGROUPED}
            </p>
          ) : null}
          {error ? <p className="text-sm text-destructive" role="alert">{error}</p> : null}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => { reset(); onOpenChange(false); }}>Cancel</Button>
          {askNoDrivers ? (
            <Button disabled={add.isPending} onClick={() => void submit(true)}>Add anyway</Button>
          ) : (
            <Button disabled={add.isPending || chosen.length === 0 || missingDistance} onClick={() => void submit()}>
              Add {chosen.length > 0 ? `${chosen.length} postcode${chosen.length === 1 ? "" : "s"}` : ""}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
