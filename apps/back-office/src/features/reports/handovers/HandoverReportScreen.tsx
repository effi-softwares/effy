import { useState } from "react"

import { useQuery } from "@tanstack/react-query"

import { PARCEL_MISSING_REASON_WORDS, READ_OUTCOME_WORDS, type HandoverMixDTO, type HandoverReportDTO } from "@effy/shared-types"
import {
  DateField,
  Skeleton,
} from "@effy/design-system/ui"
import { StaticTable, type EffyColumnDef } from "@effy/web-kit/data-table"
import { ErrorState } from "@effy/web-kit/console"

import { PageHeader, DetailRows, Panel } from "@effy/web-kit/patterns"

import { handoverReportQuery } from "./queries"

const melbourneDay = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Melbourne" }).format(d)

const SURFACE_WORDS = { driver_app: "Driver app", shop_web: "Shop console", back_office: "Back-office" } as const
const ACTOR_WORDS = { driver: "Drivers", shop_staff: "Shop staff", admin_staff: "Hub staff" } as const

const total = (m: HandoverMixDTO) => m.scan + m.typed + m.manual
const pct = (n: number, of: number) => (of === 0 ? "—" : `${Math.round((n / of) * 100)}%`)

export function HandoverReportScreen() {
  const today = melbourneDay(new Date())
  const [from, setFrom] = useState(melbourneDay(new Date(Date.now() - 6 * 86_400_000)))
  const [to, setTo] = useState(today)
  const { data, error, isError, isPending, refetch } = useQuery(handoverReportQuery(from, to))

  return (
    <>
      <PageHeader
        title="Hand-over report"
        description="Every bag hand-over between shops, drivers and the hub, and how it was recorded."
        actions={
          <div className="flex flex-wrap items-end gap-2">
            <label className="space-y-1 text-sm">
              <span className="text-muted-foreground">From</span>
              <DateField value={from} max={to} onChange={(v) => v && setFrom(v)} className="w-40" />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-muted-foreground">To</span>
              <DateField value={to} min={from} max={today} onChange={(v) => v && setTo(v)} className="w-40" />
            </label>
          </div>
        }
      />

      {isError ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : isPending ? (
        <Skeleton className="h-64" />
      ) : (
        <div className="space-y-6">
          <Panel title="Summary">
            <DetailRows
              rows={[
                { label: "Hand-overs", value: total(data.overall) },
                {
                  label: "Scanned",
                  value: `${data.overall.scan} (${pct(data.overall.scan, total(data.overall))}) · typed ${data.overall.typed} · by hand ${data.overall.manual}`,
                },
                {
                  label: "Exceptions per 1,000 hand-overs",
                  value: data.exceptionsPer1000 === null ? "—" : data.exceptionsPer1000,
                },
                {
                  label: "Exceptions",
                  value: `${data.exceptions} — refused reads (not repeats) and bags declared missing`,
                },
                { label: "Phone and server disagreed", value: data.disagreements },
              ]}
            />
          </Panel>

          <Panel title="By who handed over" flush>
            <MixTable
              rows={data.byActor.map((r) => ({ key: r.actor, name: ACTOR_WORDS[r.actor], ...r }))}
              label="By who handed over"
              first="Who"
            />
          </Panel>

          <Panel
            title="By shop"
            description="Least scanned first — a shop low here is usually printing labels badly."
            flush
          >
            <MixTable
              rows={data.byShop.map((r) => ({ key: r.shopId, name: r.shopName, ...r }))}
              label="By shop"
              first="Shop"
            />
          </Panel>

          <Panel title="By driver" description="Least scanned first." flush>
            <MixTable
              rows={data.byDriver.map((r) => ({ key: r.driverId, name: r.driverName, ...r }))}
              label="By driver"
              first="Driver"
            />
          </Panel>

          <div className="grid gap-6 lg:grid-cols-2">
            <Panel title="Refused reads" flush>
              {data.refused.length === 0 ? (
                <p className="px-5 py-4 text-sm text-muted-foreground">No read was refused in this period.</p>
              ) : (
                <StaticTable
                  label="Refused reads"
                  columns={REFUSED_COLUMNS}
                  rows={data.refused}
                  getRowId={(r) => `${r.outcome}:${r.surface}`}
                  initialSort={{ id: "reads", desc: true }}
                  framed={false}
                />
              )}
            </Panel>
            <Panel title="Bags declared missing" flush>
              {data.missing.length === 0 ? (
                <p className="px-5 py-4 text-sm text-muted-foreground">No bag was declared missing in this period.</p>
              ) : (
                <StaticTable
                  label="Bags declared missing"
                  columns={MISSING_COLUMNS}
                  rows={data.missing}
                  getRowId={(r) => r.reason}
                  initialSort={{ id: "bags", desc: true }}
                  framed={false}
                />
              )}
            </Panel>
          </div>
        </div>
      )}
    </>
  )
}

function MixTable({
  rows,
  label,
  first,
}: {
  rows: Array<HandoverMixDTO & { key: string; name: string }>
  label: string
  first: string
}) {
  if (rows.length === 0) return <p className="px-5 py-4 text-sm text-muted-foreground">No hand-overs in this period.</p>
  return (
    <StaticTable label={label} columns={mixColumns(first)} rows={rows} getRowId={(r) => r.key} framed={false} />
  )
}

type MixRow = HandoverMixDTO & { key: string; name: string }
type Refused = HandoverReportDTO["refused"][number]
type Missing = HandoverReportDTO["missing"][number]

/** The rows arrive in the report's order (least scanned first); every column sorts in the browser (103). */
function mixColumns(first: string): EffyColumnDef<MixRow>[] {
  const count = (id: "scan" | "typed" | "manual", header: string): EffyColumnDef<MixRow> => ({
    id,
    accessorFn: (r) => r[id],
    sortDescFirst: true,
    header,
    cell: ({ row }) => row.original[id],
    meta: { label: header, align: "numeric" },
  })
  return [
    { id: "name", accessorFn: (r) => r.name.toLowerCase(), header: first, cell: ({ row }) => row.original.name, meta: { label: first, identifying: true, phone: "primary" } },
    count("scan", "Scanned"),
    count("typed", "Typed"),
    count("manual", "By hand"),
    {
      id: "share",
      accessorFn: (r) => (total(r) === 0 ? -1 : r.scan / total(r)),
      header: "Scanned share",
      cell: ({ row }) => pct(row.original.scan, total(row.original)),
      meta: { label: "Scanned share", align: "numeric", phone: "trail" },
    },
  ]
}

const REFUSED_COLUMNS: EffyColumnDef<Refused>[] = [
  { id: "outcome", header: "Outcome", cell: ({ row }) => READ_OUTCOME_WORDS[row.original.outcome], meta: { label: "Outcome", identifying: true, phone: "primary" } },
  { id: "where", header: "Where", cell: ({ row }) => SURFACE_WORDS[row.original.surface], meta: { label: "Where" } },
  { id: "reads", accessorFn: (r) => r.count, sortDescFirst: true, header: "Reads", cell: ({ row }) => row.original.count, meta: { label: "Reads", align: "numeric", phone: "trail" } },
]

const MISSING_COLUMNS: EffyColumnDef<Missing>[] = [
  {
    id: "reason",
    header: "Reason",
    cell: ({ row }) => PARCEL_MISSING_REASON_WORDS[row.original.reason] ?? row.original.reason,
    meta: { label: "Reason", identifying: true, phone: "primary" },
  },
  { id: "bags", accessorFn: (r) => r.count, sortDescFirst: true, header: "Bags", cell: ({ row }) => row.original.count, meta: { label: "Bags", align: "numeric", phone: "trail" } },
]
