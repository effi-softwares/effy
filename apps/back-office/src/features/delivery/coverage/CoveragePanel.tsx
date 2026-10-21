import { useMemo, useState } from "react";

import { useInfiniteQuery } from "@tanstack/react-query";
import { MapPin, Plus } from "lucide-react";

import type { CoverageGroupDTO, CoveragePostcodeDTO } from "@effy/shared-types";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, Button, Checkbox, Skeleton,
  Tabs, TabsContent, TabsCount, TabsList, TabsTrigger,
} from "@effy/design-system/ui";
import { ErrorState } from "@effy/web-kit/console";

import { PageHeader } from "@/components/patterns/Page";
import { EmptyState } from "@/components/patterns/States";
import { StatusWord } from "@/components/patterns/StatusWord";
import { Facet, ResetFilters, SearchBox, Toolbar } from "@/components/patterns/Toolbar";

import { coverageError, isNoDriverCovers, NO_DRIVER_GROUP, NO_DRIVER_UNGROUPED } from "../errorText";
import { coverageQuery, usePatchCoveragePostcodes, useRemoveCoveragePostcode } from "../queries";
import type { CoverageFilters } from "../repo";

import { AddPlacesDialog } from "./AddPlacesDialog";
import { CourierPanel } from "./CourierPanel";
import { DistanceDialog } from "./DistanceDialog";
import { GroupsPanel } from "./GroupsPanel";
import { PostcodeChecker } from "./PostcodeChecker";

const SELECT = "h-8 rounded-md border border-input bg-background px-2 text-[13px] shadow-xs";

/**
 * Coverage (076): the ONE list of postcodes Effy delivers to with its own drivers.
 *
 * Being on the list is what makes an address "Delivered by Effy". A group is a label for staff and
 * changes nothing a customer sees, is offered or pays. This replaces the Zones and Rings tabs and
 * the per-shop same-day exceptions, none of which has a control any more.
 *
 * A table with a toolbar and three plain sections beneath — no cards (Principle V).
 *
 * 097 — each postcode also says whether delivery TODAY is offered there. Switched in bulk from the
 * selection (filter "Farther than", select all shown, "Don't offer"); never per group.
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
  const [todayTo, setTodayTo] = useState<"" | "offer" | "stop">("");
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

  /** 097 — offer, or stop offering, delivery today at the selected postcodes. */
  async function setToday(offered: boolean) {
    setNote(null);
    try {
      await patch.mutateAsync({ postcodes: [...selected], todayOffered: offered });
      setSelected(new Set());
      setTodayTo("");
    } catch (err) {
      setNote(coverageError(err));
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

  const distanceFacet = filters.review ? "review" : (filters.source ?? null);
  const anyFilter = Boolean(filters.q || filters.group || filters.source || filters.review || filters.today || filters.minKm);
  const allShownSelected = rows.length > 0 && rows.every((r) => selected.has(r.postcode));

  return (
    <>
      <PageHeader
        title="Where Effy delivers"
        description="An address in a postcode on this list is Delivered by Effy. Groups only organise the list — they change nothing a customer sees or pays, and no shop setting changes it either."
        actions={
          canManage ? (
            <Button onClick={() => setAddOpen(true)}>
              <Plus aria-hidden="true" />
              Add places
            </Button>
          ) : undefined
        }
      />

      <Tabs defaultValue="postcodes">
        <div className="bo-tabsbar">
          <div className="bo-tabsbar__list">
            <TabsList aria-label="Coverage sections">
              <TabsTrigger value="postcodes">
                Postcodes
                {first ? <TabsCount>{first.counts.listed}</TabsCount> : null}
              </TabsTrigger>
              <TabsTrigger value="groups">
                Groups
                <TabsCount>{groups.length}</TabsCount>
              </TabsTrigger>
            </TabsList>
          </div>
          {first ? (
            <p className="bo-sub" data-testid="coverage-counts">
              {first.counts.listed} postcode{first.counts.listed === 1 ? "" : "s"} listed
              {first.counts.manualDistance > 0 ? ` · ${first.counts.manualDistance} with a distance entered by hand` : ""}
              {first.counts.needsReview > 0 ? ` · ${first.counts.needsReview} to review` : ""}
              {first.counts.todayNotOffered > 0 ? ` · ${first.counts.todayNotOffered} not offered delivery today` : ""}
            </p>
          ) : null}
        </div>

        <TabsContent value="postcodes" className="bo-tabpanel">
          <Toolbar>
            <form onSubmit={applySearch} className="contents">
              <SearchBox
                label="Find in the list"
                placeholder="Place or postcode"
                value={search}
                onChange={(v) => {
                  setSearch(v);
                  if (v.trim() === "") setFilters((f) => ({ ...f, q: undefined }));
                }}
              />
            </form>
            <Facet
              label="Group"
              anyLabel="All groups"
              value={filters.group ?? null}
              onChange={(v) => setFilters((f) => ({ ...f, group: v ?? undefined }))}
              options={[{ value: "none", label: "No group" }, ...groups.map((g) => ({ value: g.id, label: g.name }))]}
            />
            <Facet
              label="Distance"
              value={distanceFacet}
              onChange={(v) => setFilters((f) => ({ ...f, review: v === "review" || undefined, source: v === "manual" || v === "computed" ? v : undefined }))}
              options={[
                { value: "computed", label: "Worked out" },
                { value: "manual", label: "Entered by hand" },
                { value: "review", label: "To review" },
              ]}
            />
            <Facet
              label="Farther than"
              value={filters.minKm ?? null}
              onChange={(v) => setFilters((f) => ({ ...f, minKm: v ?? undefined }))}
              options={[
                { value: "10", label: "10 km" },
                { value: "25", label: "25 km" },
                { value: "50", label: "50 km" },
              ]}
            />
            <Facet
              label="Delivery today"
              value={filters.today ?? null}
              onChange={(v) => setFilters((f) => ({ ...f, today: v ?? undefined }))}
              options={[
                { value: "offered", label: "Offered" },
                { value: "not_offered", label: "Not offered" },
              ]}
            />
            {anyFilter ? (
              <ResetFilters
                onReset={() => {
                  setSearch("");
                  setFilters({});
                }}
              />
            ) : null}
          </Toolbar>

          {canManage && selected.size > 0 ? (
            <div className="bo-bulkbar" data-testid="coverage-bulk">
              <span className="text-sm font-medium">{selected.size} selected</span>
              <select aria-label="Move to group" className={SELECT} value={moveTo} onChange={(e) => setMoveTo(e.target.value)}>
                <option value="">Move to group…</option>
                <option value="none">No group</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
              <Button size="sm" variant="outline" disabled={!moveTo || patch.isPending} onClick={() => void move(moveTo === "none" ? null : moveTo)}>
                Move
              </Button>
              <select
                aria-label="Delivery today"
                className={SELECT}
                value={todayTo}
                onChange={(e) => setTodayTo(e.target.value as "" | "offer" | "stop")}
              >
                <option value="">Delivery today…</option>
                <option value="offer">Offer</option>
                <option value="stop">Don't offer</option>
              </select>
              <Button size="sm" variant="outline" disabled={!todayTo || patch.isPending} onClick={() => void setToday(todayTo === "offer")}>
                Apply
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
                Clear
              </Button>
            </div>
          ) : null}

          {note ? (
            <p className="text-sm font-medium" role="alert">
              {note}
            </p>
          ) : null}

          {coverage.isError ? (
            <ErrorState error={coverage.error} onRetry={() => void coverage.refetch()} />
          ) : coverage.isPending ? (
            <div className="bo-table-wrap p-4" aria-busy="true">
              <Skeleton className="mb-3 h-10" />
              <Skeleton className="h-10" />
            </div>
          ) : rows.length === 0 ? (
            <EmptyState
              icon={MapPin}
              title={anyFilter ? "No listed postcode matches." : "No postcodes yet"}
              description={anyFilter ? undefined : "Effy delivers nowhere until a place is added."}
            />
          ) : (
            <div className="bo-table-wrap">
              <div className="bo-table-scroll">
                <table className="bo-table bo-rtable">
                  <thead>
                    <tr>
                      {canManage ? (
                        <th className="w-10">
                          <Checkbox
                            aria-label="Select all shown"
                            checked={allShownSelected}
                            onCheckedChange={(v) => setSelected(v === true ? new Set(rows.map((r) => r.postcode)) : new Set())}
                          />
                        </th>
                      ) : null}
                      <th>Postcode</th>
                      <th>Places</th>
                      <th>Group</th>
                      <th>Distance from hub</th>
                      <th>Delivery today</th>
                      {canManage ? <th className="text-right">Actions</th> : null}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.postcode} data-state={selected.has(r.postcode) ? "selected" : undefined}>
                        {canManage ? (
                          <td className="max-md:hidden">
                            <Checkbox
                              aria-label={`Select ${r.postcode}`}
                              checked={selected.has(r.postcode)}
                              onCheckedChange={(v) => toggle(r.postcode, v === true)}
                            />
                          </td>
                        ) : null}
                        <td data-m="primary">
                          <span className="bo-code font-medium">{r.postcode}</span>
                          <div className="bo-sub md:hidden">{r.places.slice(0, 3).join(", ")}</div>
                        </td>
                        <td data-m="meta" className="max-md:hidden">
                          {r.places.slice(0, 3).join(", ") || "—"}
                          {r.places.length > 3 ? <span className="text-muted-foreground"> +{r.places.length - 3} more</span> : null}
                          {r.state ? <span className="text-muted-foreground"> · {r.state}</span> : null}
                        </td>
                        <td data-m="meta" className="is-muted">
                          {r.groupId ? (groupName.get(r.groupId) ?? "—") : "No group"}
                        </td>
                        <td data-m="trail">
                          <span className="flex flex-wrap items-center gap-2">
                            <span className="tabular-nums">{r.distanceKm} km</span>
                            <span className="bo-sub">{r.distanceSource === "manual" ? "entered by hand" : "worked out"}</span>
                            {r.needsReview ? <StatusWord tone="waiting">Review</StatusWord> : null}
                          </span>
                        </td>
                        <td data-m="meta">
                          {r.todayOffered ? <span className="bo-sub">Offered</span> : <StatusWord tone="muted">Not offered</StatusWord>}
                        </td>
                        {canManage ? (
                          <td className="text-right whitespace-nowrap">
                            <Button variant="outline" size="sm" onClick={() => setDistanceOf(r)}>
                              Distance
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => setRemoving(r)}>
                              Remove
                            </Button>
                          </td>
                        ) : null}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {coverage.hasNextPage ? (
                <div className="bo-pager">
                  <span>{rows.length} shown</span>
                  <Button variant="outline" size="sm" disabled={coverage.isFetchingNextPage} onClick={() => void coverage.fetchNextPage()}>
                    Show more
                  </Button>
                </div>
              ) : null}
            </div>
          )}

          <PostcodeChecker />
        </TabsContent>

        <TabsContent value="groups" className="bo-tabpanel">
          <div className="bo-settings">
            {first ? <GroupsPanel groups={groups} ungrouped={first.ungrouped} canManage={canManage} /> : null}
          </div>
        </TabsContent>
      </Tabs>

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
    </>
  );
}

/**
 * Courier delivery (076 US4; 079; redesign, board "Courier delivery and services") — its own page
 * now, reading the courier reach the coverage list carries.
 */
export function CourierPage({ canManage }: { canManage: boolean }) {
  const coverage = useInfiniteQuery(coverageQuery({}));
  const first = coverage.data?.pages[0];
  return (
    <>
      <PageHeader
        title="Courier delivery"
        description="Where an address that is not on Effy's list is offered courier delivery, what the shopper is told, and the courier services the business uses."
      />
      {coverage.isError ? (
        <ErrorState error={coverage.error} onRetry={() => void coverage.refetch()} />
      ) : !first ? (
        <Skeleton className="h-60" aria-busy="true" />
      ) : (
        <div className="bo-settings">
          <CourierPanel courier={first.courier} canManage={canManage} />
        </div>
      )}
    </>
  );
}
