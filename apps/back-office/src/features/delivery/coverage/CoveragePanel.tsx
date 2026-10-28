import { useMemo, useState } from "react"

import { useInfiniteQuery } from "@tanstack/react-query"
import { MapPin, Plus } from "lucide-react"

import type { CoverageGroupDTO, CoveragePostcodeDTO } from "@effy/shared-types"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Button,
  Checkbox,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tabs,
  TabsContent,
  TabsCount,
  TabsList,
  TabsTrigger,
} from "@effy/design-system/ui"
import { ErrorState } from "@effy/web-kit/console"

import { PageHeader, EmptyState, StatusWord, Facet, ResetFilters, SearchBox, Toolbar } from "@effy/web-kit/patterns"

import { coverageError, isNoDriverCovers, NO_DRIVER_GROUP, NO_DRIVER_UNGROUPED } from "../errorText"
import { coverageQuery, usePatchCoveragePostcodes, useRemoveCoveragePostcode } from "../queries"
import type { CoverageFilters } from "../repo"

import { AddPlacesDialog } from "./AddPlacesDialog"
import { DistanceDialog } from "./DistanceDialog"
import { GroupsPanel } from "./GroupsPanel"
import { PostcodeChecker } from "./PostcodeChecker"

export function CoveragePanel({ canManage }: { canManage: boolean }) {
  const [filters, setFilters] = useState<CoverageFilters>({})
  const [search, setSearch] = useState("")
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [addOpen, setAddOpen] = useState(false)
  const [distanceOf, setDistanceOf] = useState<CoveragePostcodeDTO | null>(null)
  const [removing, setRemoving] = useState<CoveragePostcodeDTO | null>(null)
  const [moveTo, setMoveTo] = useState("")
  const [confirmMove, setConfirmMove] = useState<string | null | undefined>(undefined)
  const [todayTo, setTodayTo] = useState<"" | "offer" | "stop">("")
  const [note, setNote] = useState<string | null>(null)

  const coverage = useInfiniteQuery(coverageQuery(filters))
  const patch = usePatchCoveragePostcodes()
  const remove = useRemoveCoveragePostcode()

  const first = coverage.data?.pages[0]
  const rows = useMemo(() => coverage.data?.pages.flatMap((p) => p.postcodes) ?? [], [coverage.data])
  const groups: CoverageGroupDTO[] = first?.groups ?? []
  const groupName = useMemo(() => new Map(groups.map((g) => [g.id, g.name])), [groups])

  function applySearch(e: React.FormEvent) {
    e.preventDefault()
    setFilters((f) => ({ ...f, q: search.trim() || undefined }))
  }

  function toggle(postcode: string, on: boolean) {
    setSelected((s) => {
      const next = new Set(s)
      if (on) next.add(postcode)
      else next.delete(postcode)
      return next
    })
  }

  async function move(target: string | null, confirmNoDrivers = false) {
    setNote(null)
    try {
      await patch.mutateAsync({
        postcodes: [...selected],
        groupId: target,
        ...(confirmNoDrivers ? { confirmNoDrivers: true } : {}),
      })
      setSelected(new Set())
      setMoveTo("")
      setConfirmMove(undefined)
    } catch (err) {
      if (isNoDriverCovers(err) && !confirmNoDrivers) setConfirmMove(target)
      else setNote(coverageError(err))
    }
  }

  async function setToday(offered: boolean) {
    setNote(null)
    try {
      await patch.mutateAsync({ postcodes: [...selected], todayOffered: offered })
      setSelected(new Set())
      setTodayTo("")
    } catch (err) {
      setNote(coverageError(err))
    }
  }

  async function confirmRemove() {
    if (!removing) return
    setNote(null)
    try {
      await remove.mutateAsync(removing.postcode)
      toggle(removing.postcode, false)
    } catch (err) {
      setNote(coverageError(err))
    } finally {
      setRemoving(null)
    }
  }

  const distanceFacet = filters.review ? "review" : (filters.source ?? null)
  const anyFilter = Boolean(
    filters.q || filters.group || filters.source || filters.review || filters.today || filters.minKm,
  )
  const allShownSelected = rows.length > 0 && rows.every((r) => selected.has(r.postcode))

  return (
    <>
      <PageHeader
        title="Where Effy delivers"
        description="The postcodes Effy's own drivers deliver to, organised into optional groups."
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
        <div className="ef-tabsbar">
          <div className="ef-tabsbar__list">
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
            <p className="mt-0.5 block text-sm text-muted-foreground" data-testid="coverage-counts">
              {first.counts.listed} postcode{first.counts.listed === 1 ? "" : "s"} listed
              {first.counts.manualDistance > 0
                ? ` · ${first.counts.manualDistance} with a distance entered by hand`
                : ""}
              {first.counts.needsReview > 0 ? ` · ${first.counts.needsReview} to review` : ""}
              {first.counts.todayNotOffered > 0 ? ` · ${first.counts.todayNotOffered} not offered delivery today` : ""}
            </p>
          ) : null}
        </div>

        <TabsContent value="postcodes" className="ef-tabpanel">
          <Toolbar>
            <form onSubmit={applySearch} className="contents">
              <SearchBox
                label="Find in the list"
                placeholder="Place or postcode"
                value={search}
                onChange={(v) => {
                  setSearch(v)
                  if (v.trim() === "") setFilters((f) => ({ ...f, q: undefined }))
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
              onChange={(v) =>
                setFilters((f) => ({
                  ...f,
                  review: v === "review" || undefined,
                  source: v === "manual" || v === "computed" ? v : undefined,
                }))
              }
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
                  setSearch("")
                  setFilters({})
                }}
              />
            ) : null}
          </Toolbar>

          {canManage && selected.size > 0 ? (
            <div
              className="sticky bottom-4 z-20 mx-auto flex w-fit max-w-full flex-wrap items-center gap-2 rounded-xl border bg-popover py-2 pr-2 pl-4 text-popover-foreground shadow-lg"
              data-testid="coverage-bulk"
            >
              <span className="text-sm font-medium">{selected.size} selected</span>
              <Select
                value={moveTo}
                onValueChange={(next) => {
                  setMoveTo(next)
                }}
              >
                <SelectTrigger size="sm" aria-label="Move to group">
                  <SelectValue placeholder="Move to group…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No group</SelectItem>
                  {groups.map((g) => (
                    <SelectItem key={g.id} value={g.id}>
                      {g.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                size="sm"
                variant="outline"
                disabled={!moveTo || patch.isPending}
                onClick={() => void move(moveTo === "none" ? null : moveTo)}
              >
                Move
              </Button>
              <Select
                value={todayTo}
                onValueChange={(next) => {
                  setTodayTo(next as "" | "offer" | "stop")
                }}
              >
                <SelectTrigger size="sm" aria-label="Delivery today">
                  <SelectValue placeholder="Delivery today…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="offer">Offer</SelectItem>
                  <SelectItem value="stop">Don't offer</SelectItem>
                </SelectContent>
              </Select>
              <Button
                size="sm"
                variant="outline"
                disabled={!todayTo || patch.isPending}
                onClick={() => void setToday(todayTo === "offer")}
              >
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
            <div className="overflow-hidden rounded-xl border bg-card p-4" aria-busy="true">
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
            <div className="overflow-hidden rounded-xl border bg-card">
              <div className="min-w-0">
                <Table className="ef-rtable">
                  <TableHeader>
                    <TableRow>
                      {canManage ? (
                        <TableHead className="w-10">
                          <Checkbox
                            aria-label="Select all shown"
                            checked={allShownSelected}
                            onCheckedChange={(v) =>
                              setSelected(v === true ? new Set(rows.map((r) => r.postcode)) : new Set())
                            }
                          />
                        </TableHead>
                      ) : null}
                      <TableHead>Postcode</TableHead>
                      <TableHead>Places</TableHead>
                      <TableHead>Group</TableHead>
                      <TableHead>Distance from hub</TableHead>
                      <TableHead>Delivery today</TableHead>
                      {canManage ? <TableHead className="text-right">Actions</TableHead> : null}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((r) => (
                      <TableRow key={r.postcode} data-state={selected.has(r.postcode) ? "selected" : undefined}>
                        {canManage ? (
                          <TableCell className="max-md:hidden">
                            <Checkbox
                              aria-label={`Select ${r.postcode}`}
                              checked={selected.has(r.postcode)}
                              onCheckedChange={(v) => toggle(r.postcode, v === true)}
                            />
                          </TableCell>
                        ) : null}
                        <TableCell data-m="primary">
                          <span className="font-mono font-medium">{r.postcode}</span>
                          <div className="mt-0.5 block text-sm text-muted-foreground md:hidden">
                            {r.places.slice(0, 3).join(", ")}
                          </div>
                        </TableCell>
                        <TableCell data-m="meta" className="max-md:hidden">
                          {r.places.slice(0, 3).join(", ") || "—"}
                          {r.places.length > 3 ? (
                            <span className="text-muted-foreground"> +{r.places.length - 3} more</span>
                          ) : null}
                          {r.state ? <span className="text-muted-foreground"> · {r.state}</span> : null}
                        </TableCell>
                        <TableCell data-m="meta" className="text-muted-foreground">
                          {r.groupId ? (groupName.get(r.groupId) ?? "—") : "No group"}
                        </TableCell>
                        <TableCell data-m="trail">
                          <span className="flex flex-wrap items-center gap-2">
                            <span className="tabular-nums">{r.distanceKm} km</span>
                            <span className="mt-0.5 block text-sm text-muted-foreground">
                              {r.distanceSource === "manual" ? "entered by hand" : "worked out"}
                            </span>
                            {r.needsReview ? <StatusWord tone="waiting">Review</StatusWord> : null}
                          </span>
                        </TableCell>
                        <TableCell data-m="meta">
                          {r.todayOffered ? (
                            <span className="mt-0.5 block text-sm text-muted-foreground">Offered</span>
                          ) : (
                            <StatusWord tone="muted">Not offered</StatusWord>
                          )}
                        </TableCell>
                        {canManage ? (
                          <TableCell className="text-right whitespace-nowrap">
                            <Button variant="outline" size="sm" onClick={() => setDistanceOf(r)}>
                              Distance
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => setRemoving(r)}>
                              Remove
                            </Button>
                          </TableCell>
                        ) : null}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              {coverage.hasNextPage ? (
                <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t px-4 py-3 text-sm text-muted-foreground">
                  <span>{rows.length} shown</span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={coverage.isFetchingNextPage}
                    onClick={() => void coverage.fetchNextPage()}
                  >
                    Show more
                  </Button>
                </div>
              ) : null}
            </div>
          )}

          <PostcodeChecker />
        </TabsContent>

        <TabsContent value="groups" className="ef-tabpanel">
          <div className="settings">
            {first ? <GroupsPanel groups={groups} ungrouped={first.ungrouped} canManage={canManage} /> : null}
          </div>
        </TabsContent>
      </Tabs>

      <AddPlacesDialog open={addOpen} onOpenChange={setAddOpen} groups={groups} />
      {distanceOf ? <DistanceDialog postcode={distanceOf} onClose={() => setDistanceOf(null)} /> : null}

      <AlertDialog
        open={removing != null}
        onOpenChange={(o) => {
          if (!o) setRemoving(null)
        }}
      >
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

      <AlertDialog
        open={confirmMove !== undefined}
        onOpenChange={(o) => {
          if (!o) setConfirmMove(undefined)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>No driver can deliver there</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmMove === null ? NO_DRIVER_UNGROUPED : NO_DRIVER_GROUP}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void move(confirmMove ?? null, true)}>Move anyway</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
