import { useEffect, useMemo, useState } from "react"

import { useQuery } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import { AlertTriangle, Search } from "lucide-react"

import {
  Checkbox,
  Input,
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
  TabsList,
  TabsTrigger,
} from "@effy/design-system/ui"
import { ErrorState } from "@effy/web-kit/console"

import { track } from "@/lib/telemetry"

import { BulkActions } from "./components/BulkActions"
import { FulfillmentStatusBadge } from "./components/FulfillmentStatusBadge"
import { PromiseCell } from "./components/PromiseCell"
import {
  formatTime,
  STATUS_LABEL,
  type FulfillmentQueueState,
  type FulfillmentStatus,
  type FulfillmentSummary,
} from "./model"
import { fulfillmentQueueQuery } from "./queries"

const ALL = "all"

/**
 * The shop's order queue (US1 + US4's completed view, restyled by 057 US2).
 *
 * ⚠ THE ROW ORDER IS THE SERVER'S, AND FILTERING MUST NOT DISTURB IT (FR-001b, SC-020). Promise
 * first, then arrival. There is no client-side SORT here and there must never be one: an at-risk row
 * escalates by PROMINENCE in place (SC-018), never by moving, because a queue that reshuffles under a
 * working hand is how the wrong order gets picked. Search and filter only REMOVE rows — the surviving
 * rows keep the server's sequence exactly.
 *
 * ⚠ SEARCH AND FILTER ARE CLIENT-SIDE, over the page the server already sent. A shop's active queue is
 * tens of rows, not thousands; a server round trip per keystroke would add latency and a second
 * ordering authority for no gain. If a shop's queue ever outgrows one page this becomes a server
 * concern — and the note is here so that is a decision rather than a discovery.
 */
export function OrderQueueScreen() {
  const [state, setState] = useState<FulfillmentQueueState>("active")
  const [q, setQ] = useState("")
  const [status, setStatus] = useState<FulfillmentStatus | typeof ALL>(ALL)
  const [risk, setRisk] = useState<"all" | "at-risk">("all")
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set())

  const { data, error, isPending, isError, refetch } = useQuery(fulfillmentQueueQuery(state))

  // Keyed on `state` only — this is "the operator looked at this slice of the queue", not "a poll
  // completed". Firing per refetch would emit an event every 15 seconds for an idle open tablet.
  useEffect(() => {
    track({ name: "shop_order_queue_viewed", state })
  }, [state])

  // ⚠ Selection is cleared when the slice changes. Carrying it across tabs would let an operator
  // advance rows they can no longer see, which is the definition of an unreviewed bulk action.
  useEffect(() => {
    setSelected(new Set())
  }, [state])

  const rows = data?.items ?? []

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return rows.filter((r) => {
      if (status !== ALL && r.status !== status) return false
      if (risk === "at-risk" && !r.atRisk) return false
      if (needle && !r.orderNumber.toLowerCase().includes(needle)) return false
      return true
    })
  }, [rows, q, status, risk])

  // Statuses actually present, so the filter never offers a value that would empty the table.
  const presentStatuses = useMemo(
    () => [...new Set(rows.map((r) => r.status))],
    [rows],
  )

  const allVisibleSelected = visible.length > 0 && visible.every((r) => selected.has(r.id))

  function toggleAll(on: boolean) {
    setSelected(on ? new Set(visible.map((r) => r.id)) : new Set())
  }
  function toggleOne(id: string, on: boolean) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (on) next.add(id)
      else next.delete(id)
      return next
    })
  }

  const filtered = q.trim() !== "" || status !== ALL || risk !== "all"

  return (
    <div className="flex flex-col gap-[var(--pad)]">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Orders</h1>
        <p className="text-muted-foreground">
          Orders your shop must fulfil — most urgent first. Updates automatically.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Tabs value={state} onValueChange={(v) => setState(v as FulfillmentQueueState)}>
          <TabsList>
            <TabsTrigger value="active">Active</TabsTrigger>
            <TabsTrigger value="completed">Completed</TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="relative">
          <Search
            className="text-muted-foreground pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2"
            aria-hidden="true"
          />
          <Input
            aria-label="Search by order number"
            placeholder="Search order number…"
            className="w-56 pl-8"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>

        <Select
          value={status}
          onValueChange={(v) => setStatus(v as FulfillmentStatus | typeof ALL)}
        >
          <SelectTrigger className="w-44" aria-label="Filter by state">
            <SelectValue placeholder="State" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All states</SelectItem>
            {presentStatuses.map((s) => (
              <SelectItem key={s} value={s}>
                {STATUS_LABEL[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={risk} onValueChange={(v) => setRisk(v as "all" | "at-risk")}>
          <SelectTrigger className="w-40" aria-label="Filter by risk">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Any promise</SelectItem>
            <SelectItem value="at-risk">At risk only</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {selected.size > 0 ? (
        <BulkActions rows={rows} selected={selected} onClear={() => setSelected(new Set())} />
      ) : null}

      {isError ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : isPending ? (
        <QueueSkeleton />
      ) : (
        <>
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox
                      aria-label="Select all shown orders"
                      checked={allVisibleSelected}
                      disabled={visible.length === 0}
                      onCheckedChange={(v) => toggleAll(v === true)}
                    />
                  </TableHead>
                  <TableHead>Order</TableHead>
                  <TableHead>Arrived</TableHead>
                  <TableHead>Ready by</TableHead>
                  <TableHead>Items</TableHead>
                  <TableHead>State</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="h-24 text-center">
                      <p className="text-muted-foreground text-sm">
                        {filtered
                          ? "No orders match this filter."
                          : state === "active"
                            ? "No orders waiting. New orders appear here automatically."
                            : "No completed orders yet."}
                      </p>
                    </TableCell>
                  </TableRow>
                ) : (
                  visible.map((row) => (
                    <QueueRow
                      key={row.id}
                      row={row}
                      selected={selected.has(row.id)}
                      onSelect={(on) => toggleOne(row.id, on)}
                    />
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          <p className="text-muted-foreground text-sm">
            {filtered ? (
              <>
                Showing <span className="tabular-nums">{visible.length}</span> of{" "}
                <span className="tabular-nums">{rows.length}</span>{" "}
                {state === "active" ? "active" : "completed"} orders
              </>
            ) : (
              <>
                <span className="tabular-nums">{rows.length}</span>{" "}
                {state === "active" ? "active" : "completed"} order
                {rows.length === 1 ? "" : "s"}
              </>
            )}
          </p>
        </>
      )}
    </div>
  )
}

function QueueRow({
  row,
  selected,
  onSelect,
}: {
  row: FulfillmentSummary
  selected: boolean
  onSelect: (on: boolean) => void
}) {
  return (
    <TableRow data-state={selected ? "selected" : undefined}>
      <TableCell>
        <Checkbox
          aria-label={`Select ${row.orderNumber}`}
          checked={selected}
          onCheckedChange={(v) => onSelect(v === true)}
        />
      </TableCell>
      <TableCell>
        <Link
          to="/orders/$fulfillmentId"
          params={{ fulfillmentId: row.id }}
          className={
            row.atRisk
              ? "text-foreground font-semibold hover:underline"
              : "font-medium hover:underline"
          }
        >
          {row.orderNumber}
        </Link>
      </TableCell>
      <TableCell className="tabular-nums">{formatTime(row.placedAt)}</TableCell>
      <TableCell>
        <PromiseCell promise={row.promise} atRisk={row.atRisk} />
      </TableCell>
      <TableCell>
        <span className="tabular-nums">
          {row.gatheredCount}/{row.itemCount}
        </span>
        {row.unavailableCount > 0 ? (
          <div className="text-foreground flex items-center gap-1 text-xs font-medium">
            <AlertTriangle className="size-3 shrink-0" aria-hidden="true" />
            {row.unavailableCount} unavailable
          </div>
        ) : null}
      </TableCell>
      <TableCell>
        <FulfillmentStatusBadge status={row.status} />
      </TableCell>
    </TableRow>
  )
}

function QueueSkeleton() {
  return (
    <div className="space-y-2 rounded-md border p-4">
      {[0, 1, 2, 3, 4].map((i) => (
        <Skeleton key={i} className="h-10 w-full" />
      ))}
    </div>
  )
}
