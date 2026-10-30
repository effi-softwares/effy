import { useMemo, useState } from "react"

import { useQuery } from "@tanstack/react-query"
import { Link, useSearch } from "@tanstack/react-router"
import { CircleCheck, Hourglass, PackageSearch, PackageX, Route, ShieldAlert, Undo2, Warehouse } from "lucide-react"

import type { DeliveryExceptionDTO } from "@effy/shared-types"
import { Button, Tabs, TabsContent, TabsCount, TabsList, TabsTrigger } from "@effy/design-system/ui"
import { ErrorState } from "@effy/web-kit/console"

import { DataTable, listQueryOptions, SearchBox, useListState, ViewSelect, type EffyColumnDef } from "@effy/web-kit/data-table"
import {
  Bone,
  Loading,
  PageHeader,
  StatusWord,
  TableSkeleton,
  TabsSkeleton,
} from "@effy/web-kit/patterns"
import { useSessionRoles } from "@/features/auth/useSessionRoles"
import { moment } from "@/lib/format"

import { canResolveExceptions } from "./access"
import { exceptionsList, reasonLabel } from "./model"
import { EXCEPTIONS_KEY } from "./queries"
import { fetchExceptionsBoard } from "./repo"
import { RecordReturnButton } from "./RecordReturnDialog"
import { OUTCOME_WORDS, ResolveDialog } from "./ResolveDialog"
import { HeldPanel, OverduePanel, VehicleChecksPanel } from "./SequenceSections"

type Section = "failed" | "runs" | "vehicles" | "missing"

export function ExceptionsScreen() {
  const [section, setSection] = useState<Section>("failed")
  const canResolve = canResolveExceptions(useSessionRoles())
  const state = useListState(exceptionsList, useSearch({ strict: false }))
  const input = { key: [...EXCEPTIONS_KEY, "list"] as const, list: exceptionsList, view: state.view, fetch: fetchExceptionsBoard }
  const query = useQuery(listQueryOptions(input))
  const open = query
  const data = query.data?.board
  const view = state.view.filters.view ?? "open"
  const unsafe = data?.vehicleChecks?.filter((c) => c.unsafe && c.clearedAt === null).length ?? 0
  const columns = useMemo(() => exceptionColumns(canResolve), [canResolve])

  return (
    <>
      <PageHeader
        title="Delivery exceptions"
        description="Deliveries a driver could not complete that need someone to decide what happens next."
        actions={
          <Button variant="outline" asChild>
            <Link to="/orders/assignments">
              <Route aria-hidden="true" />
              Dispatch
            </Link>
          </Button>
        }
      />

      {open.isError && !data ? (
        <ErrorState error={open.error} onRetry={() => void open.refetch()} />
      ) : !data ? (
        <Loading>
          <TabsSkeleton
            tabs={[
              <>
                <PackageX aria-hidden="true" />
                Failed deliveries
              </>,
              <>
                <Hourglass aria-hidden="true" />
                Runs waiting
              </>,
              <>
                <ShieldAlert aria-hidden="true" />
                Vehicle checks
              </>,
              <>
                <PackageSearch aria-hidden="true" />
                Missing packages
              </>,
            ]}
          />
          <div className="flex flex-wrap gap-2">
            <Bone kind="control" className="w-36" />
            <Bone kind="control" className="w-72 max-w-full" />
          </div>
          <TableSkeleton framed columns={["Order", "Reason", "Driver", "Destination", "Package", "When", ""]} />
        </Loading>
      ) : (
        <Tabs value={section} onValueChange={(v) => setSection(v as Section)}>
          <div className="ef-tabsbar">
            <div className="ef-tabsbar__list">
              <TabsList aria-label="Exception kinds">
                <TabsTrigger value="failed">
                  <PackageX aria-hidden="true" />
                  Failed deliveries
                  {Number(data.openCount) > 0 ? <TabsCount>{data.openCount}</TabsCount> : null}
                </TabsTrigger>
                <TabsTrigger value="runs">
                  <Hourglass aria-hidden="true" />
                  Runs waiting
                  {(data.overdue?.length ?? 0) > 0 ? <TabsCount>{data.overdue!.length}</TabsCount> : null}
                </TabsTrigger>
                <TabsTrigger value="vehicles">
                  <ShieldAlert aria-hidden="true" />
                  Vehicle checks
                  {unsafe > 0 ? <TabsCount>{unsafe}</TabsCount> : null}
                </TabsTrigger>
                <TabsTrigger value="missing">
                  <PackageSearch aria-hidden="true" />
                  Missing packages
                  {(data.held?.length ?? 0) > 0 ? <TabsCount>{data.held!.length}</TabsCount> : null}
                </TabsTrigger>
              </TabsList>
            </div>
            <span className="text-xs text-muted-foreground max-md:hidden">
              Live - nothing here refreshes on a timer
            </span>
          </div>

          <TabsContent value="failed" className="ef-tabpanel">
            <DataTable
              app="back-office"
              label="Failed deliveries"
              list={exceptionsList}
              state={state}
              columns={columns}
              query={query}
              queryInput={input}
              viewFilters={["view"]}
              rowId={(e) => e.exceptionId}
              empty={
                view === "resolved"
                  ? { icon: CircleCheck, title: "Nothing has been dealt with yet" }
                  : { icon: CircleCheck, title: "Every delivery got through", description: "No driver has reported a delivery they could not complete." }
              }
              toolbar={
                <>
                  <ViewSelect
                    label="Show"
                    value={view}
                    onChange={(v) => state.setFilter("view", v === "open" ? undefined : v)}
                    options={[
                      { value: "open" as const, label: "Open", count: data.openCount, attention: true },
                      { value: "resolved" as const, label: "Dealt with" },
                      { value: "all" as const, label: "All" },
                    ]}
                  />
                  <SearchBox label="Search exceptions" placeholder="Order, driver or suburb…" value={state.draftQ} onChange={state.setQ} />
                </>
              }
            />
          </TabsContent>
          <TabsContent value="runs" className="ef-tabpanel">
            <OverduePanel data={data} />
          </TabsContent>
          <TabsContent value="vehicles" className="ef-tabpanel">
            <VehicleChecksPanel data={data} canAct={canResolve} />
          </TabsContent>
          <TabsContent value="missing" className="ef-tabpanel">
            <HeldPanel data={data} canAct={canResolve} />
          </TabsContent>
        </Tabs>
      )}

      {!canResolve ? (
        <p className="text-xs text-muted-foreground">
          A customer-service agent sees these lists read-only - closing and acting needs an admin or a manager.
        </p>
      ) : null}
    </>
  )
}

function exceptionColumns(canResolve: boolean): EffyColumnDef<DeliveryExceptionDTO>[] {
  return [
    { id: "order", header: "Order", cell: ({ row }) => row.original.orderNumber, meta: { label: "Order", identifying: true, phone: "primary", align: "mono" } },
    {
      id: "reason",
      header: "Reason",
      cell: ({ row }) => (
        <span className="whitespace-normal">
          <span className="font-medium">{reasonLabel(row.original.reason)}</span>
          {row.original.note ? <span className="mt-0.5 block text-sm text-muted-foreground">{row.original.note}</span> : null}
        </span>
      ),
      meta: { label: "Reason" },
    },
    { id: "driver", header: "Driver", cell: ({ row }) => row.original.driverName, meta: { label: "Driver", priority: 2 } },
    { id: "destination", header: "Destination", cell: ({ row }) => row.original.destinationSuburb ?? "-", meta: { label: "Destination", priority: 2, phone: "hide" } },
    {
      id: "package",
      header: "Package",
      cell: ({ row }) => {
        const e = row.original
        return e.packageLocation === "with_driver" ? (
          <StatusWord tone="problem" icon={Undo2}>
            With {e.driverName} - to return
          </StatusWord>
        ) : (
          <StatusWord tone="moving" icon={Warehouse}>
            {e.returnedAt ? `Returned ${moment(e.returnedAt).toLowerCase()}` : "At hub"}
          </StatusWord>
        )
      },
      meta: { label: "Package", phone: "badge" },
    },
    {
      id: "when",
      header: "When",
      cell: ({ row }) => <span className="text-muted-foreground">{moment(row.original.failedAt)}</span>,
      meta: { label: "When", sortKey: "when", phone: "hide" },
    },
    {
      id: "action",
      header: () => <span className="sr-only">Action</span>,
      cell: ({ row }) => {
        const e = row.original
        return e.resolvedAt ? (
          <span className="text-xs text-muted-foreground">
            {e.resolution?.outcome ? OUTCOME_WORDS[e.resolution.outcome].label : "Dealt with"}
            {e.resolution?.note ? <span className="mt-0.5 block text-sm text-muted-foreground">{e.resolution.note}</span> : null}
          </span>
        ) : canResolve && e.packageLocation === "with_driver" ? (
          <RecordReturnButton exception={e} />
        ) : canResolve ? (
          <ResolveDialog exception={e} />
        ) : (
          <span className="text-xs text-muted-foreground">Admin or manager</span>
        )
      },
      meta: { label: "Action", phone: "full", className: "text-right" },
    },
  ]
}
