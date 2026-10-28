import { useState } from "react"

import { useQuery } from "@tanstack/react-query"

import { PARCEL_MISSING_REASON_WORDS, READ_OUTCOME_WORDS, type HandoverMixDTO } from "@effy/shared-types"
import {
  DateField,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@effy/design-system/ui"
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
                <Table className="[&_td]:py-2" aria-label="Refused reads">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Outcome</TableHead>
                      <TableHead>Where</TableHead>
                      <TableHead className="text-right">Reads</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.refused.map((r) => (
                      <TableRow key={`${r.outcome}:${r.surface}`}>
                        <TableCell>{READ_OUTCOME_WORDS[r.outcome]}</TableCell>
                        <TableCell>{SURFACE_WORDS[r.surface]}</TableCell>
                        <TableCell className="text-right tabular-nums">{r.count}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </Panel>
            <Panel title="Bags declared missing" flush>
              {data.missing.length === 0 ? (
                <p className="px-5 py-4 text-sm text-muted-foreground">No bag was declared missing in this period.</p>
              ) : (
                <Table className="[&_td]:py-2" aria-label="Bags declared missing">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Reason</TableHead>
                      <TableHead className="text-right">Bags</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.missing.map((r) => (
                      <TableRow key={r.reason}>
                        <TableCell>{PARCEL_MISSING_REASON_WORDS[r.reason] ?? r.reason}</TableCell>
                        <TableCell className="text-right tabular-nums">{r.count}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
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
    <Table className="[&_td]:py-2" aria-label={label}>
      <TableHeader>
        <TableRow>
          <TableHead>{first}</TableHead>
          <TableHead className="text-right">Scanned</TableHead>
          <TableHead className="text-right">Typed</TableHead>
          <TableHead className="text-right">By hand</TableHead>
          <TableHead className="text-right">Scanned share</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => (
          <TableRow key={r.key}>
            <TableCell>{r.name}</TableCell>
            <TableCell className="text-right tabular-nums">{r.scan}</TableCell>
            <TableCell className="text-right tabular-nums">{r.typed}</TableCell>
            <TableCell className="text-right tabular-nums">{r.manual}</TableCell>
            <TableCell className="text-right tabular-nums">{pct(r.scan, total(r))}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
