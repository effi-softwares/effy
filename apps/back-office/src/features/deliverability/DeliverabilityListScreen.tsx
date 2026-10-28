import { useMemo, useState } from "react"

import { useQuery } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import { MailCheck } from "lucide-react"

import { Skeleton, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@effy/design-system/ui"
import { ErrorState } from "@effy/web-kit/console"

import { EmptyState, PageHeader, Pager, SearchBox, StatusWord, Toolbar, ViewSelect } from "@effy/web-kit/patterns"
import { moment } from "@/lib/format"

import { STATE_LABEL, type EmailDeliveryState } from "./model"
import { deliverabilityListQuery } from "./queries"

const PAGE_SIZE = 25
const PROBLEMS = "problems"

const VIEWS: readonly { key: string; label: string }[] = [
  { key: PROBLEMS, label: "Needs attention" },
  { key: "undeliverable", label: STATE_LABEL.undeliverable },
  { key: "soft_failing", label: STATE_LABEL.soft_failing },
  { key: "complained", label: STATE_LABEL.complained },
  { key: "all", label: "All addresses" },
]

export function DeliverabilityListScreen() {
  const [state, setState] = useState<string>(PROBLEMS)
  const [q, setQ] = useState("")
  const [page, setPage] = useState(0)

  const params = useMemo(
    () => ({
      state: state === PROBLEMS ? undefined : (state as EmailDeliveryState | "all"),
      q: q.trim() || undefined,
      limit: PAGE_SIZE,
      offset: page * PAGE_SIZE,
    }),
    [state, q, page],
  )

  const { data, isPending, isError, error, refetch } = useQuery(deliverabilityListQuery(params))
  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1

  return (
    <>
      <PageHeader
        title="Email deliverability"
        description="Email addresses that are bouncing or rejected, which can stop people receiving sign-in codes."
      />
      <Toolbar>
        <ViewSelect
          label="Deliverability views"
          value={state}
          onChange={(v) => {
            setState(v)
            setPage(0)
          }}
          options={VIEWS.map((v) => ({
            value: v.key,
            label: v.label,
            count: v.key === state ? data?.total : undefined,
          }))}
        />
        <SearchBox
          label="Search address"
          placeholder="Search address…"
          value={q}
          onChange={(v) => {
            setQ(v)
            setPage(0)
          }}
        />
      </Toolbar>

      {isError ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : isPending ? (
        <div className="overflow-hidden rounded-xl border bg-card p-4" aria-busy="true">
          <Skeleton className="mb-3 h-10" />
          <Skeleton className="h-10" />
        </div>
      ) : data.items.length === 0 ? (
        <EmptyState
          icon={MailCheck}
          title="No delivery problems."
          description="Every address the platform has emailed is reachable."
        />
      ) : (
        <div className="overflow-hidden rounded-xl border bg-card">
          <div className="min-w-0">
            <Table className="ef-rtable">
              <TableHeader>
                <TableRow>
                  <TableHead>Address</TableHead>
                  <TableHead>State</TableHead>
                  <TableHead>Account</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Last event</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.items.map((r) => (
                  <TableRow key={r.address}>
                    <TableCell data-m="primary">
                      <Link to="/deliverability/$address" params={{ address: r.address }} className="link">
                        {r.address}
                      </Link>
                    </TableCell>
                    <TableCell data-m="badge">
                      <StateLabel state={r.state} />
                    </TableCell>
                    <TableCell data-m="meta">
                      {r.subject ? (
                        <>
                          {r.subject.name ?? <span className="text-muted-foreground">unnamed</span>}{" "}
                          <span className="mt-0.5 block text-sm text-muted-foreground">
                            ({r.subject.kind.replace("_", " ")})
                          </span>
                        </>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell data-m="meta" className="text-muted-foreground">
                      <span className="font-mono text-xs">{r.reason ?? "—"}</span>
                    </TableCell>
                    <TableCell data-m="trail" className="text-muted-foreground whitespace-nowrap">
                      {moment(r.lastEventAt)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <Pager
            summary={`${data.total} address${data.total === 1 ? "" : "es"} · page ${page + 1} of ${totalPages}`}
            canBack={page > 0}
            canNext={(page + 1) * PAGE_SIZE < data.total}
            onBack={() => setPage((p) => Math.max(0, p - 1))}
            onNext={() => setPage((p) => p + 1)}
          />
        </div>
      )}
    </>
  )
}

const STATE_TONE = {
  undeliverable: "problem",
  soft_failing: "waiting",
  complained: "waiting",
  reachable: "quiet",
} as const

export function StateLabel({ state }: { state: EmailDeliveryState }) {
  return <StatusWord tone={STATE_TONE[state as keyof typeof STATE_TONE] ?? "quiet"}>{STATE_LABEL[state]}</StatusWord>
}
