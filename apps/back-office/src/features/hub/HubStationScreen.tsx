import { useState } from "react"

import { useQuery } from "@tanstack/react-query"
import { Warehouse } from "lucide-react"

import { PARCEL_ZONE_WORDS, type HubCheckinResultDTO } from "@effy/shared-types"
import { Skeleton, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@effy/design-system/ui"
import { ErrorState } from "@effy/web-kit/console"
import { ScanField } from "@effy/web-kit/scanner"

import { PageHeader, Panel, EmptyState } from "@effy/web-kit/patterns"
import { track } from "@/lib/telemetry"

import { hubExpectedQuery, useHubCheckin } from "./queries"

const TOKEN = /^EFY1:[2-9A-HJKMNP-TV-Z]{6}$/

export function HubStationScreen() {
  const { data, error, isError, isPending, refetch } = useQuery(hubExpectedQuery())
  const checkin = useHubCheckin()
  const [last, setLast] = useState<HubCheckinResultDTO | null>(null)
  const [failed, setFailed] = useState(false)
  const [recent, setRecent] = useState<HubCheckinResultDTO[]>([])

  function onRead(read: { raw: string; method: "scan" | "typed" }) {
    setFailed(false)
    checkin.mutate(
      { clientReadId: crypto.randomUUID(), raw: read.raw, method: read.method, deviceAt: new Date().toISOString() },
      {
        onSuccess: (res) => {
          const r = res.results[0]
          if (!r) return
          setLast(r)
          setRecent((xs) => [r, ...xs].slice(0, 8))
          track({ name: "hub_checkin_scanned", outcome: r.outcome, method: read.method })
        },
        onError: () => setFailed(true),
      },
    )
  }

  const runs = data?.runs ?? []
  const owed = runs.reduce((a, r) => a + r.bags.filter((b) => !b.checkedIn).length, 0)

  return (
    <>
      <PageHeader
        title="Hub station"
        description="Scan bags arriving from collection runs to check them in and see where each goes."
      />

      <div className="space-y-6">
        <section aria-label="Scan" className="space-y-4">
          <ScanField
            size="large"
            accept={(t) => TOKEN.test(t)}
            onRead={onRead}
            disabled={checkin.isPending}
            placeholder="Scan a bag, or type its code"
          />
          <div role="status" aria-live="assertive" className="min-h-24 rounded-lg border border-border px-5 py-4">
            {failed ? (
              <p className="text-2xl font-semibold">That scan didn't reach the server. Scan it again.</p>
            ) : last ? (
              <ResultLine r={last} />
            ) : (
              <p className="text-lg text-muted-foreground">
                Ready. {owed > 0 ? `${owed} bag${owed === 1 ? "" : "s"} on the way in.` : "Nothing on the way in."}
              </p>
            )}
          </div>
          {recent.length > 1 ? (
            <ol className="space-y-1 text-sm text-muted-foreground" aria-label="Earlier scans">
              {recent.slice(1).map((r) => (
                <li key={r.clientReadId}>
                  <span className="font-mono">{r.code ?? "—"}</span> · {r.words}
                  {r.sort ? ` · ${r.sort.label}` : ""}
                </li>
              ))}
            </ol>
          ) : null}
        </section>

        {isError ? (
          <ErrorState error={error} onRetry={() => void refetch()} />
        ) : isPending ? (
          <Skeleton className="h-48" />
        ) : runs.length === 0 ? (
          <EmptyState
            icon={Warehouse}
            title="No runs on the way in"
            description="Bags appear here once a driver collects them from a shop."
          />
        ) : (
          runs.map((run) => {
            const inCount = run.bags.filter((b) => b.checkedIn).length
            return (
              <Panel
                key={run.runId}
                title={`${run.driverName}'s collection run`}
                description={`${inCount} of ${run.bags.length} bags checked in`}
                flush
              >
                <Table className="[&_td]:py-2" aria-label={`${run.driverName}'s bags`}>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Code</TableHead>
                      <TableHead>Bag</TableHead>
                      <TableHead>Zone</TableHead>
                      <TableHead>Order</TableHead>
                      <TableHead>Goes to</TableHead>
                      <TableHead>Checked in</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {run.bags.map((b) => (
                      <TableRow key={b.parcelId} className={b.checkedIn ? "text-muted-foreground" : ""}>
                        <TableCell className="font-mono">{b.code}</TableCell>
                        <TableCell className="tabular-nums">
                          {b.seq} of {b.of}
                        </TableCell>
                        <TableCell>{PARCEL_ZONE_WORDS[b.zone]}</TableCell>
                        <TableCell className="font-mono">{b.orderNumber}</TableCell>
                        <TableCell>{b.sort.label}</TableCell>
                        <TableCell>{b.checkedIn ? "Yes" : "Not yet"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Panel>
            )
          })
        )}
      </div>
    </>
  )
}

function ResultLine({ r }: { r: HubCheckinResultDTO }) {
  if (r.outcome !== "accepted") {
    return (
      <div>
        <p className="text-3xl font-semibold">{r.words}</p>
        {r.code ? <p className="mt-1 font-mono text-muted-foreground">{r.code}</p> : null}
      </div>
    )
  }
  return (
    <div className="space-y-1">
      <p className="text-4xl font-bold tracking-tight">{r.sort?.label}</p>
      <p className="text-lg">
        {r.words}
        {r.zone && r.zone !== "ambient" ? ` · ${PARCEL_ZONE_WORDS[r.zone]}` : ""} ·{" "}
        <span className="font-mono">{r.orderNumber}</span>
        {r.runClosed ? " · Run checked in" : ""}
      </p>
    </div>
  )
}
