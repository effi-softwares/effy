import { useQuery } from "@tanstack/react-query"
import { useNavigate, useSearch } from "@tanstack/react-router"
import { CircleAlert, UserX } from "lucide-react"

import { Avatar, AvatarFallback } from "@effy/design-system/ui"
import type { AdminDriverListItem } from "@effy/shared-types"
import {
  DataTable,
  Facet,
  ListPage,
  listQueryOptions,
  SearchBox,
  useListState,
  viewsQueryOptions,
  ViewSelect,
  type EffyColumnDef,
} from "@effy/web-kit/data-table"
import { DotWord, PageHeader, StatusWord } from "@effy/web-kit/patterns"
import { initialsOf } from "@/components/shell/identity"
import { useSessionRoles } from "@/features/auth/useSessionRoles"

import { CreateDriverDialog } from "./components/CreateDriverDialog"
import { DutyPanel } from "./components/DutyPanel"
import { ReadinessPanel } from "./components/ReadinessPanel"
import { canManageDrivers } from "./access"
import { BLOCKED_LABEL, DRIVER_LIST_VIEWS, driversList, STATUS_LABEL, type DriverListView } from "./model"
import { readinessQuery, zonesQuery } from "./queries"
import { fetchDriverPage, fetchDriverViews } from "./repo"

/** `readiness` is not a slice of the register but its own panel, chosen from the same select. */
type View = DriverListView | "readiness"

const VIEW_LABEL: Record<View, string> = {
  employed: "All employed",
  active: "Active",
  suspended: "Suspended",
  offboarded: "Offboarded",
  everyone: "Everyone, incl. leavers",
  readiness: "Readiness",
}

const KEY = ["drivers"] as const

function blockedSummary(d: AdminDriverListItem): string | null {
  if (d.blockedReasons.length === 0) return null
  return d.blockedReasons.map((r) => BLOCKED_LABEL[r]).join(" · ")
}

const columns: EffyColumnDef<AdminDriverListItem>[] = [
  {
    id: "driver",
    header: "Driver",
    cell: ({ row }) => {
      const d = row.original
      const blocked = blockedSummary(d)
      return (
        <span className="flex items-center gap-3">
          <Avatar aria-hidden="true" className="rounded-lg max-md:hidden">
            <AvatarFallback className="rounded-lg">{initialsOf(d.name)}</AvatarFallback>
          </Avatar>
          <span className="min-w-0">
            <span className="block">{d.name}</span>
            {blocked ? (
              <span className="mt-0.5 flex items-center gap-1 text-sm font-medium text-foreground">
                <CircleAlert aria-hidden="true" className="size-3 shrink-0" />
                {blocked}
              </span>
            ) : null}
          </span>
        </span>
      )
    },
    meta: { label: "Driver", identifying: true, phone: "primary", sortKey: "name" },
  },
  {
    id: "email",
    header: "Work email",
    cell: ({ row }) => <span className="text-muted-foreground">{row.original.workEmail}</span>,
    meta: { label: "Work email", priority: 2 },
  },
  {
    id: "cleared",
    header: "Cleared for",
    cell: ({ row }) => {
      const c = row.original.capabilitySummary
      if (c.total === 0) return <span className="font-medium">Nothing yet</span>
      const what = c.functions.length === 2 ? "Collect + deliver" : c.functions[0] === "collection" ? "Collect" : "Deliver"
      const where = c.coversEveryZone ? "every zone" : `${c.total} grant${c.total === 1 ? "" : "s"}`
      return (
        <>
          {what} <span className="text-muted-foreground">· {where}</span>
        </>
      )
    },
    meta: { label: "Cleared for" },
  },
  {
    id: "duty",
    header: "Duty",
    cell: ({ row }) =>
      row.original.dutyState === "on_duty" ? <DotWord tone="busy">On duty</DotWord> : <DotWord tone="off">Off duty</DotWord>,
    meta: { label: "Duty", phone: "trail" },
  },
  {
    id: "employment",
    header: "Employment",
    cell: ({ row }) => {
      const s = row.original.status
      return <StatusWord tone={s === "active" ? "done" : s === "suspended" ? "problem" : "quiet"}>{STATUS_LABEL[s]}</StatusWord>
    },
    meta: { label: "Employment", priority: 2, phone: "badge" },
  },
]

export function DriversListScreen() {
  const canManage = canManageDrivers(useSessionRoles())
  const search = useSearch({ strict: false }) as Record<string, unknown>
  const navigate = useNavigate()
  const readiness = search.panel === "readiness"
  const state = useListState(driversList, search)
  const input = { key: KEY, list: driversList, view: state.view, fetch: fetchDriverPage }
  const query = useQuery({ ...listQueryOptions(input), enabled: !readiness })
  const views = useQuery({
    ...viewsQueryOptions({ key: KEY, list: driversList, view: state.view, except: ["view"], fetch: fetchDriverViews }),
    enabled: !readiness,
  })
  const zones = useQuery(zonesQuery())
  const blocked = useQuery(readinessQuery()).data?.blocked.length
  const view: View = readiness ? "readiness" : (state.view.filters.view ?? "employed")

  const viewSelect = (
    <ViewSelect
      label="Driver views"
      value={view}
      onChange={(v) => {
        if (v === "readiness") return void navigate({ to: ".", search: { panel: "readiness" } as never })
        if (readiness) return void navigate({ to: ".", search: (v === "employed" ? {} : { view: v }) as never })
        state.setFilter("view", v === "employed" ? undefined : v)
      }}
      options={([...DRIVER_LIST_VIEWS, "readiness"] as const).map((v) => ({
        value: v,
        label: VIEW_LABEL[v],
        count: v === "readiness" ? blocked || undefined : views.data?.views[v],
        attention: v === "readiness",
      }))}
    />
  )

  return (
    <ListPage
      header={
        <>
          <PageHeader
            title="Drivers"
            description="Effy's drivers, whether they are cleared to work, and any incidents on the road."
            actions={canManage ? <CreateDriverDialog /> : undefined}
          />
          <DutyPanel />
        </>
      }
    >
      {readiness ? (
        <>
          <div className="flex flex-wrap items-center gap-2">{viewSelect}</div>
          <ReadinessPanel />
        </>
      ) : (
        <DataTable
          app="back-office"
          label="Drivers"
          list={driversList}
          state={state}
          columns={columns}
          query={query}
          queryInput={input}
          viewFilters={["view"]}
          rowHref={(d) => ({ to: "/drivers/$driverId", params: { driverId: d.id } })}
          empty={{ icon: UserX, title: "No drivers yet", description: "Add the first one to give them a sign-in for the driver app." }}
          toolbar={
            <>
              {viewSelect}
              <Facet
                label="Zone"
                anyLabel="Any zone"
                value={state.view.filters.zoneId ?? null}
                onChange={(v) => state.setFilter("zoneId", v ?? undefined)}
                options={(zones.data ?? []).map((z) => ({ value: z.id, label: z.name }))}
              />
              <SearchBox label="Search drivers" placeholder="Search by name or work email…" value={state.draftQ} onChange={state.setQ} />
            </>
          }
        />
      )}
    </ListPage>
  )
}
