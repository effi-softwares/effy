import { useQuery } from "@tanstack/react-query"
import { Link, useSearch } from "@tanstack/react-router"
import { CircleAlert, Truck } from "lucide-react"

import type { VehicleListItem, VehicleOwnership, VehicleStatus } from "@effy/shared-types"
import {
  DataTable,
  Facet,
  isFiltered,
  ListPage,
  listQueryOptions,
  ResetFilters,
  SearchBox,
  useListState,
  viewsQueryOptions,
  ViewSelect,
  type EffyColumnDef,
} from "@effy/web-kit/data-table"
import { PageHeader, StatusWord } from "@effy/web-kit/patterns"
import { useSessionRoles } from "@/features/auth/useSessionRoles"

import { CreateVehicleDialog } from "./components/CreateVehicleDialog"
import { canManageVehicles } from "./access"
import {
  BODY_TYPE_LABEL,
  COMPLIANCE_LABEL,
  OWNERSHIP_LABEL,
  refrigerationLabel,
  STATUS_LABEL,
  VEHICLE_LIST_VIEWS,
  vehiclesList,
  type VehicleListView,
} from "./model"
import { fetchVehiclePage, fetchVehicleViews } from "./repo"

const VIEW_LABEL: Record<VehicleListView, string> = {
  fleet: "In the fleet",
  active: "Active",
  off_road: "Off the road",
  retired: "Retired",
}

const KEY = ["vehicles"] as const

export function vehicleStatusTone(s: VehicleStatus) {
  return s === "active" ? ("done" as const) : s === "off_road" ? ("problem" as const) : ("quiet" as const)
}

const columns: EffyColumnDef<VehicleListItem>[] = [
  {
    id: "plate",
    header: "Plate",
    cell: ({ row }) => row.original.registrationPlate,
    meta: { label: "Plate", identifying: true, phone: "primary", align: "mono", sortKey: "plate" },
  },
  {
    id: "vehicle",
    header: "Vehicle",
    cell: ({ row }) => (
      <>
        {row.original.make} {row.original.model}
        <span className="mt-0.5 block text-sm text-muted-foreground">{BODY_TYPE_LABEL[row.original.bodyType]}</span>
      </>
    ),
    meta: { label: "Vehicle", sortKey: "vehicle" },
  },
  {
    id: "carries",
    header: "Carries",
    cell: ({ row }) => refrigerationLabel(row.original.canCarryChilled, row.original.canCarryFrozen),
    meta: { label: "Carries" },
  },
  {
    id: "owner",
    header: "Owner",
    cell: ({ row }) => <span className="text-muted-foreground">{OWNERSHIP_LABEL[row.original.ownership]}</span>,
    meta: { label: "Owner", priority: 2 },
  },
  {
    id: "with",
    header: "With",
    cell: ({ row }) =>
      row.original.currentHolderDriverId ? (
        <Link
          to="/drivers/$driverId"
          params={{ driverId: row.original.currentHolderDriverId }}
          className="link"
          onClick={(e) => e.stopPropagation()}
        >
          {row.original.currentHolderName}
        </Link>
      ) : (
        <span className="text-muted-foreground">Available</span>
      ),
    meta: { label: "With", priority: 2, phone: "trail" },
  },
  {
    id: "status",
    header: "Status",
    cell: ({ row }) => {
      const v = row.original
      return (
        <>
          <StatusWord tone={vehicleStatusTone(v.status)}>{STATUS_LABEL[v.status]}</StatusWord>
          {v.complianceIssues.length > 0 ? (
            <span className="mt-1 flex items-center gap-1 text-sm font-medium text-foreground">
              <CircleAlert aria-hidden="true" className="size-3 shrink-0" />
              {v.complianceIssues.map((i) => COMPLIANCE_LABEL[i]).join(" · ")}
            </span>
          ) : null}
        </>
      )
    },
    meta: { label: "Status", phone: "badge" },
  },
]

export function VehiclesListScreen() {
  const canManage = canManageVehicles(useSessionRoles())
  const state = useListState(vehiclesList, useSearch({ strict: false }))
  const f = state.view.filters
  const input = { key: KEY, list: vehiclesList, view: state.view, fetch: fetchVehiclePage }
  const query = useQuery(listQueryOptions(input))
  const views = useQuery(viewsQueryOptions({ key: KEY, list: vehiclesList, view: state.view, except: ["view"], fetch: fetchVehicleViews }))

  return (
    <ListPage
      header={
        <PageHeader
          title="Vehicles"
          description="The vans and cars drivers use, their capacity, roadworthiness, and who has each one."
          actions={canManage ? <CreateVehicleDialog /> : undefined}
        />
      }
    >
      <DataTable
        app="back-office"
        label="Vehicles"
        list={vehiclesList}
        state={state}
        columns={columns}
        query={query}
        queryInput={input}
        viewFilters={["view"]}
        rowHref={(v) => ({ to: "/vehicles/$vehicleId", params: { vehicleId: v.id } })}
        empty={{
          icon: Truck,
          title: "No vehicles yet",
          description: "Add one to record what Effy runs - until then, nothing can be issued to a driver.",
        }}
        toolbar={
          <>
            <ViewSelect
              label="Vehicle views"
              value={f.view ?? "fleet"}
              onChange={(v) => state.setFilter("view", v === "fleet" ? undefined : v)}
              options={VEHICLE_LIST_VIEWS.map((v) => ({ value: v, label: VIEW_LABEL[v], count: views.data?.views[v] }))}
            />
            <Facet
              label="Refrigeration"
              value={f.refrigeration ?? null}
              onChange={(v) => state.setFilter("refrigeration", v ?? undefined)}
              options={[
                { value: "chilled" as const, label: "Carries chilled" },
                { value: "frozen" as const, label: "Carries frozen" },
              ]}
            />
            <Facet
              label="Owner"
              value={f.owner ?? null}
              onChange={(v) => state.setFilter("owner", v ?? undefined)}
              options={(Object.keys(OWNERSHIP_LABEL) as VehicleOwnership[]).map((o) => ({ value: o, label: OWNERSHIP_LABEL[o] }))}
            />
            <Facet
              label="Compliance"
              anyLabel="Any"
              value={f.nonCompliant ? "issues" : null}
              onChange={(v) => state.setFilter("nonCompliant", v ? true : undefined)}
              options={[{ value: "issues" as const, label: "Non-compliant only" }]}
            />
            {isFiltered(state.view, ["view"]) ? <ResetFilters onReset={state.reset} /> : null}
            <SearchBox label="Search vehicles" placeholder="Plate, make or model…" value={state.draftQ} onChange={state.setQ} />
          </>
        }
      />
    </ListPage>
  )
}
