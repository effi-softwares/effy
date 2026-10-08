import { useMemo, useState } from "react";

import { useInfiniteQuery } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { Plus } from "lucide-react";

import type { CoverageGroupDTO, CoveragePostcodeDTO } from "@effy/shared-types";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, Badge, Button, Checkbox, Input, Label,
} from "@effy/design-system/ui";
import { DataTable, ErrorState } from "@effy/web-kit/console";

import { coverageError, isNoDriverCovers, NO_DRIVER_GROUP, NO_DRIVER_UNGROUPED } from "../errorText";
import { coverageQuery, usePatchCoveragePostcodes, useRemoveCoveragePostcode } from "../queries";
import type { CoverageFilters } from "../repo";

import { AddPlacesDialog } from "./AddPlacesDialog";
import { CourierPanel } from "./CourierPanel";
import { DistanceDialog } from "./DistanceDialog";
import { GroupsPanel } from "./GroupsPanel";
import { PostcodeChecker } from "./PostcodeChecker";

const SELECT = "h-9 rounded-md border border-input bg-background px-3 text-sm";

/**
 * Coverage (076): the ONE list of postcodes Effy delivers to with its own drivers.
 *
 * Being on the list is what makes an address "Delivered by Effy". A group is a label for staff and
 * changes nothing a customer sees, is offered or pays. This replaces the Zones and Rings tabs and
 * the per-shop same-day exceptions, none of which has a control any more.
 *
 * A table with a toolbar and three plain sections beneath — no cards (Principle V).
 */
export function CoveragePanel({ canManage }: { canManage: boolean }) {
  const [filters, setFilters] = useState<CoverageFilters>({});
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [addOpen, setAddOpen] = useState(false);
  const [distanceOf, setDistanceOf] = useState<CoveragePostcodeDTO | null>(null);
  const [removing, setRemoving] = useState<CoveragePostcodeDTO | null>(null);
  const [moveTo, setMoveTo] = useState("");
  const [confirmMove, setConfirmMove] = useState<string | null | undefined>(undefined);
  const [note, setNote] = useState<string | null>(null);

  const coverage = useInfiniteQuery(coverageQuery(filters));
  const patch = usePatchCoveragePostcodes();
  const remove = useRemoveCoveragePostcode();

  const first = coverage.data?.pages[0];
  const rows = useMemo(() => coverage.data?.pages.flatMap((p) => p.postcodes) ?? [], [coverage.data]);
  const groups: CoverageGroupDTO[] = first?.groups ?? [];
  const groupName = useMemo(() => new Map(groups.map((g) => [g.id, g.name])), [groups]);

  function applySearch(e: React.FormEvent) {
    e.preventDefault();
    setFilters((f) => ({ ...f, q: search.trim() || undefined }));
  }

  function toggle(postcode: string, on: boolean) {
    setSelected((s) => {
      const next = new Set(s);
      if (on) next.add(postcode);
      else next.delete(postcode);
      return next;
    });
  }

  /** `target`: a group id, or null for "no group". */
  async function move(target: string | null, confirmNoDrivers = false) {
    setNote(null);
    try {
      await patch.mutateAsync({ postcodes: [...selected], groupId: target, ...(confirmNoDrivers ? { confirmNoDrivers: true } : {}) });
      setSelected(new Set());
      setMoveTo("");
      setConfirmMove(undefined);
    } catch (err) {
      // Not an error to show — a question to ask (the driver count is zero where they would go).
      if (isNoDriverCovers(err) && !confirmNoDrivers) setConfirmMove(target);
      else setNote(coverageError(err));
    }
  }

  async function confirmRemove() {
    if (!removing) return;
    setNote(null);
    try {
      await remove.mutateAsync(removing.postcode);
      toggle(removing.postcode, false);
    } catch (err) {
      setNote(coverageError(err));
    } finally {
      setRemoving(null);
    }
  }

  const columns: ColumnDef<CoveragePostcodeDTO>[] = [
    ...(canManage
      ? [{
          id: "select", header: "",
          cell: ({ row }) => (
            <Checkbox
              aria-label={`Select ${row.original.postcode}`}
              checked={selected.has(row.original.postcode)}
              onCheckedChange={(v) => toggle(row.original.postcode, v === true)}
            />
          ),
        } satisfies ColumnDef<CoveragePostcodeDTO>]
      : []),
    { accessorKey: "postcode", header: "Postcode", cell: ({ row }) => <span className="font-mono tabular-nums">{row.original.postcode}</span> },
    {
      id: "places", header: "Places",
      cell: ({ row }) => (
        <span>
          {row.original.places.slice(0, 3).join(", ") || "—"}
          {row.original.places.length > 3 ? <span className="text-muted-foreground"> +{row.original.places.length - 3} more</span> : null}
          {row.original.state ? <span className="text-muted-foreground"> · {row.original.state}</span> : null}
        </span>
      ),
    },
    {
      id: "group", header: "Group",
      cell: ({ row }) => row.original.groupId
        ? (groupName.get(row.original.groupId) ?? "—")
        : <span className="text-muted-foreground">No group</span>,
    },
    {
      id: "distance", header: "Distance from hub",
      cell: ({ row }) => (
        <span className="flex items-center gap-2">
          <span className="tabular-nums">{row.original.distanceKm} km</span>
          <span className="text-muted-foreground">{row.original.distanceSource === "manual" ? "entered by hand" : "worked out"}</span>
          {row.original.needsReview ? <Badge variant="warning">Review</Badge> : null}
        </span>
      ),
    },
    {
      id: "actions", header: "",
      cell: ({ row }) => canManage ? (
        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={() => setDistanceOf(row.original)}>Distance</Button>
          <Button variant="ghost" size="sm" onClick={() => setRemoving(row.original)}>Remove</Button>
        </div>
      ) : null,
    },
  ];

  return (
    <div className="space-y-8">
      <section className="space-y-4" aria-labelledby="coverage-list">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1">
            <h2 id="coverage-list" className="text-base font-semibold">Where Effy delivers</h2>
            <p className="max-w-2xl text-sm text-muted-foreground">
              An address in a postcode on this list is <span className="font-medium text-foreground">Delivered by Effy</span>.
              Groups only organise the list — they change nothing a customer sees or pays, and no shop setting changes it either.
            </p>
            {first ? (
              <p className="text-sm text-muted-foreground" data-testid="coverage-counts">
                {first.counts.listed} postcode{first.counts.listed === 1 ? "" : "s"} listed
                {first.counts.manualDistance > 0 ? ` · ${first.counts.manualDistance} with a distance entered by hand` : ""}
                {first.counts.needsReview > 0 ? ` · ${first.counts.needsReview} to review` : ""}
              </p>
            ) : null}
          </div>
          {canManage ? <Button onClick={() => setAddOpen(true)}><Plus /> Add places</Button> : null}
        </div>

        <PostcodeChecker />

        <div className="flex flex-wrap items-end gap-3">
          <form onSubmit={applySearch} className="flex items-end gap-2">
            <div className="space-y-1.5">
              <Label htmlFor="coverage-search">Find in the list</Label>
              <Input id="coverage-search" className="w-56" placeholder="Place or postcode" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <Button type="submit" variant="outline">Find</Button>
          </form>
          <div className="space-y-1.5">
            <Label htmlFor="coverage-group">Group</Label>
            <select id="coverage-group" className={SELECT} value={filters.group ?? ""}
              onChange={(e) => setFilters((f) => ({ ...f, group: e.target.value || undefined }))}>
              <option value="">All</option>
              <option value="none">No group</option>
              {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="coverage-source">Distance</Label>
            <select id="coverage-source" className={SELECT}
              value={filters.review ? "review" : (filters.source ?? "")}
              onChange={(e) => {
                const v = e.target.value;
                setFilters((f) => ({ ...f, review: v === "review" || undefined, source: v === "manual" || v === "computed" ? v : undefined }));
              }}>
              <option value="">Any</option>
              <option value="computed">Worked out</option>
              <option value="manual">Entered by hand</option>
              <option value="review">To review</option>
            </select>
          </div>
        </div>

        {canManage && selected.size > 0 ? (
          <div className="flex flex-wrap items-end gap-3 rounded-md border bg-muted px-3 py-2" data-testid="coverage-bulk">
            <span className="pb-2 text-sm">{selected.size} selected</span>
            <div className="space-y-1.5">
              <Label htmlFor="coverage-move">Move to group</Label>
              <select id="coverage-move" className={SELECT} value={moveTo} onChange={(e) => setMoveTo(e.target.value)}>
                <option value="">Choose…</option>
                <option value="none">No group</option>
                {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
            </div>
            <Button variant="outline" disabled={!moveTo || patch.isPending} onClick={() => void move(moveTo === "none" ? null : moveTo)}>Move</Button>
            <Button variant="ghost" onClick={() => setSelected(new Set())}>Clear</Button>
          </div>
        ) : null}

        {note ? <p className="text-sm text-destructive" role="alert">{note}</p> : null}

        {coverage.isError ? <ErrorState error={coverage.error} onRetry={() => void coverage.refetch()} />
          : coverage.isPending ? <p className="text-sm text-muted-foreground">Loading…</p>
          : (
            <>
              <DataTable columns={columns} data={rows}
                emptyMessage={filters.q || filters.group || filters.source || filters.review
                  ? "No listed postcode matches."
                  : "No postcodes yet — Effy delivers nowhere until a place is added."} />
              {coverage.hasNextPage ? (
                <Button variant="outline" disabled={coverage.isFetchingNextPage} onClick={() => void coverage.fetchNextPage()}>Show more</Button>
              ) : null}
            </>
          )}
      </section>

      {first ? <GroupsPanel groups={groups} ungrouped={first.ungrouped} canManage={canManage} /> : null}
      {first ? <CourierPanel courier={first.courier} canManage={canManage} /> : null}

      <AddPlacesDialog open={addOpen} onOpenChange={setAddOpen} groups={groups} />
      {distanceOf ? <DistanceDialog postcode={distanceOf} onClose={() => setDistanceOf(null)} /> : null}

      <AlertDialog open={removing != null} onOpenChange={(o) => { if (!o) setRemoving(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Stop delivering to {removing?.postcode}?</AlertDialogTitle>
            <AlertDialogDescription>
              {removing?.places.length ? `${removing.places.join(", ")} will no longer be Delivered by Effy. ` : ""}
              Orders already placed there are not affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction onClick={() => void confirmRemove()}>Remove from the list</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmMove !== undefined} onOpenChange={(o) => { if (!o) setConfirmMove(undefined); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>No driver can deliver there</AlertDialogTitle>
            <AlertDialogDescription>{confirmMove === null ? NO_DRIVER_UNGROUPED : NO_DRIVER_GROUP}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void move(confirmMove ?? null, true)}>Move anyway</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
