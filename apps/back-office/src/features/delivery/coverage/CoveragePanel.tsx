import { useEffect, useMemo, useState } from "react"

import { useQuery } from "@tanstack/react-query"
import { useSearch } from "@tanstack/react-router"
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
  Select,
  SelectContent,
  SelectItem,
  SelectValue,
  Tabs,
  TabsContent,
  TabsCount,
  TabsList,
  TabsTrigger,
} from "@effy/design-system/ui"
import {
  DataTable,
  Facet,
  isFiltered,
  listQueryOptions,
  ResetFilters,
  SearchBox,
  useListState,
  type EffyColumnDef,
} from "@effy/web-kit/data-table"
import { ActionBarButton, ActionBarSelectTrigger } from "@effy/web-kit/action-bar"
import { PageHeader, StatusWord } from "@effy/web-kit/patterns"

import { coverageError, isNoDriverCovers, NO_DRIVER_GROUP, NO_DRIVER_UNGROUPED } from "../errorText"
import { COVERAGE_KEY, usePatchCoveragePostcodes, useRemoveCoveragePostcode } from "../queries"
import { listCoverage } from "../repo"

import { AddPlacesDialog } from "./AddPlacesDialog"
import { DistanceDialog } from "./DistanceDialog"
import { GroupsPanel } from "./GroupsPanel"
import { coverageList } from "./list"
import { PostcodeChecker } from "./PostcodeChecker"

export function CoveragePanel({ canManage }: { canManage: boolean }) {
  const state = useListState(coverageList, useSearch({ strict: false }))
  const filters = state.view.filters
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set())
  const [addOpen, setAddOpen] = useState(false)
  const [distanceOf, setDistanceOf] = useState<CoveragePostcodeDTO | null>(null)
  const [removing, setRemoving] = useState<CoveragePostcodeDTO | null>(null)
  const [moveTo, setMoveTo] = useState("")
  const [confirmMove, setConfirmMove] = useState<string | null | undefined>(undefined)
  const [todayTo, setTodayTo] = useState<"" | "offer" | "stop">("")
  const [note, setNote] = useState<string | null>(null)

  const input = { key: COVERAGE_KEY, list: coverageList, view: state.view, fetch: listCoverage }
  const coverage = useQuery(listQueryOptions(input))
  const patch = usePatchCoveragePostcodes()
  const remove = useRemoveCoveragePostcode()

  const first = coverage.data
  const groups: CoverageGroupDTO[] = useMemo(() => first?.groups ?? [], [first])
  const groupName = useMemo(() => new Map(groups.map((g) => [g.id, g.name])), [groups])
  // A selection is of what is listed: a new search or filter starts it again (103 FR-019).
  const filterKey = JSON.stringify([state.view.q, filters])
  useEffect(() => setSelected(new Set()), [filterKey])

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
      setSelected((s) => new Set([...s].filter((p) => p !== removing.postcode)))
    } catch (err) {
      setNote(coverageError(err))
    } finally {
      setRemoving(null)
    }
  }

  const distanceFacet = filters.review ? "review" : (filters.source ?? null)
  const columns = useMemo(
    () => coverageColumns(groupName, canManage ? { onDistance: setDistanceOf, onRemove: setRemoving } : null),
    [groupName, canManage],
  )

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
          <DataTable
            app="back-office"
            label="Postcodes Effy delivers to"
            list={coverageList}
            state={state}
            columns={columns}
            query={coverage}
            queryInput={input}
            rowId={(r) => r.postcode}
            selection={
              canManage
                ? {
                  selected,
                  onChange: setSelected,
                  label: (r) => r.postcode,
                  barLabel: "Selected postcodes",
                  busy: patch.isPending,
                  actions: (
                    <>
                      <Select value={moveTo} onValueChange={setMoveTo}>
                        <ActionBarSelectTrigger aria-label="Move to group">
                          <SelectValue placeholder="Move to group…" />
                        </ActionBarSelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">No group</SelectItem>
                          {groups.map((g) => (
                            <SelectItem key={g.id} value={g.id}>
                              {g.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <ActionBarButton
                        disabled={!moveTo || patch.isPending}
                        onClick={() => void move(moveTo === "none" ? null : moveTo)}
                      >
                        Move
                      </ActionBarButton>
                      <Select value={todayTo} onValueChange={(next) => setTodayTo(next as "" | "offer" | "stop")}>
                        <ActionBarSelectTrigger aria-label="Delivery today">
                          <SelectValue placeholder="Delivery today…" />
                        </ActionBarSelectTrigger>
                        <SelectContent>
                          <SelectItem value="offer">Offer</SelectItem>
                          <SelectItem value="stop">Don't offer</SelectItem>
                        </SelectContent>
                      </Select>
                      <ActionBarButton
                        disabled={!todayTo || patch.isPending}
                        onClick={() => void setToday(todayTo === "offer")}
                      >
                        Apply
                      </ActionBarButton>
                    </>
                  ),
                }
                : undefined
            }
            empty={{ icon: MapPin, title: "No postcodes yet", description: "Effy delivers nowhere until a place is added." }}
            above={
              note ? (
                <p className="text-sm font-medium" role="alert">
                  {note}
                </p>
              ) : null
            }
            toolbar={
              <>
                <Facet
                  label="Group"
                  anyLabel="All groups"
                  value={filters.group ?? null}
                  onChange={(v) => state.setFilter("group", v ?? undefined)}
                  options={[{ value: "none", label: "No group" }, ...groups.map((g) => ({ value: g.id, label: g.name }))]}
                />
                <Facet
                  label="Distance"
                  value={distanceFacet}
                  onChange={(v) =>
                    state.setFilters({ review: v === "review" ? true : undefined, source: v === "manual" || v === "computed" ? v : undefined })
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
                  onChange={(v) => state.setFilter("minKm", v ?? undefined)}
                  options={[
                    { value: "10" as const, label: "10 km" },
                    { value: "25" as const, label: "25 km" },
                    { value: "50" as const, label: "50 km" },
                  ]}
                />
                <Facet
                  label="Delivery today"
                  value={filters.today ?? null}
                  onChange={(v) => state.setFilter("today", v ?? undefined)}
                  options={[
                    { value: "offered" as const, label: "Offered" },
                    { value: "not_offered" as const, label: "Not offered" },
                  ]}
                />
                {isFiltered(state.view) ? <ResetFilters onReset={state.reset} /> : null}
                <SearchBox label="Find in the list" placeholder="Place or postcode" value={state.draftQ} onChange={state.setQ} />
              </>
            }
          />


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

type RowActions = { onDistance: (r: CoveragePostcodeDTO) => void; onRemove: (r: CoveragePostcodeDTO) => void }

function coverageColumns(groupName: ReadonlyMap<string, string>, actions: RowActions | null): EffyColumnDef<CoveragePostcodeDTO>[] {
  return [
    {
      id: "postcode",
      header: "Postcode",
      cell: ({ row }) => (
        <>
          <span className="font-mono font-medium">{row.original.postcode}</span>
          <span className="mt-0.5 block text-sm text-muted-foreground md:hidden">{row.original.places.slice(0, 3).join(", ")}</span>
        </>
      ),
      meta: { label: "Postcode", identifying: true, phone: "primary", sortKey: "postcode" },
    },
    {
      id: "places",
      header: "Places",
      cell: ({ row }) => {
        const r = row.original
        return (
          <>
            {r.places.slice(0, 3).join(", ") || "-"}
            {r.places.length > 3 ? <span className="text-muted-foreground"> +{r.places.length - 3} more</span> : null}
            {r.state ? <span className="text-muted-foreground"> · {r.state}</span> : null}
          </>
        )
      },
      meta: { label: "Places", priority: 2, phone: "hide" },
    },
    {
      id: "group",
      header: "Group",
      cell: ({ row }) => (
        <span className="text-muted-foreground">{row.original.groupId ? (groupName.get(row.original.groupId) ?? "-") : "No group"}</span>
      ),
      meta: { label: "Group" },
    },
    {
      id: "distance",
      header: "Distance from hub",
      cell: ({ row }) => {
        const r = row.original
        return (
          <span className="flex flex-wrap items-center gap-2">
            <span className="tabular-nums">{r.distanceKm} km</span>
            <span className="text-sm text-muted-foreground">{r.distanceSource === "manual" ? "entered by hand" : "worked out"}</span>
            {r.needsReview ? <StatusWord tone="waiting">Review</StatusWord> : null}
          </span>
        )
      },
      meta: { label: "Distance from hub", sortKey: "distance", phone: "trail" },
    },
    {
      id: "today",
      header: "Delivery today",
      cell: ({ row }) =>
        row.original.todayOffered ? <span className="text-sm text-muted-foreground">Offered</span> : <StatusWord tone="muted">Not offered</StatusWord>,
      meta: { label: "Delivery today" },
    },
    ...(actions
      ? [
        {
          id: "actions",
          header: () => <span className="sr-only">Actions</span>,
          cell: ({ row }) => (
            <span className="flex justify-end gap-1">
              <Button variant="outline" size="sm" onClick={() => actions.onDistance(row.original)}>
                Distance
              </Button>
              <Button variant="ghost" size="sm" onClick={() => actions.onRemove(row.original)}>
                Remove
              </Button>
            </span>
          ),
          meta: { label: "Actions", phone: "full", className: "text-right" },
        } satisfies EffyColumnDef<CoveragePostcodeDTO>,
      ]
      : []),
  ]
}
