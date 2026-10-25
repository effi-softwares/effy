import { useQuery } from "@tanstack/react-query"
import { CalendarClock, ChevronDown, ChevronUp, Clock, Route, Undo2, UserRound } from "lucide-react"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
  Button,
  Skeleton,
} from "@effy/design-system/ui"
import type { DeliveryWindow } from "@effy/shared-types"

import { PageHeader, Panel, Callout, EmptyState, StatusWord } from "@effy/web-kit/patterns"
import { useHeaderDetail } from "@effy/web-kit/console"
import { useSessionRoles } from "@/features/auth/useSessionRoles"

import { canDispatch } from "./access"
import { ReassignDialog } from "./components/ReassignDialog"
import { useRoundEditing } from "./components/ReorderControl"
import { WaiveSequenceButton } from "./components/WaiveSequenceButton"
import { WINDOW_STATE_LABEL, momentText, roundOpenState, windowNoteFor } from "./model"
import { dispatchDayQuery, dispatchRoundQuery } from "./queries"

interface RoundDetail {
  id: string
  kind: string
  status: string
  driverId: string
  updatedAt: string
  deadlineAt: string
  opensAt: string | null
  stage?: string
  stageLabel?: string
  outOfOrder?: boolean
  waiver?: { reason: string; staffName: string; at: string } | null
  stops: Array<{
    stopId: string
    seq: number | null
    kind: string
    status: string
    zoneName: string | null
    label: string
    orderNumber: string | null
    deliveryWindow?: DeliveryWindow | null
    handovers?: { scan: number; typed: number; manual: number }
  }>
}

export function RoundDetailScreen({ roundId }: { roundId: string }) {
  const { data, isPending, isError } = useQuery(dispatchRoundQuery(roundId))
  const day = useQuery(dispatchDayQuery())
  const roles = useSessionRoles()
  const round = data as RoundDetail | undefined
  const editing = useRoundEditing(roundId, round?.stops.map((s) => s.stopId) ?? [], round?.updatedAt ?? "")
  useHeaderDetail(round ? (round.kind === "collection" ? "Collection run" : "Delivery round") : null)

  if (isPending) {
    return (
      <div className="space-y-4" aria-busy="true">
        <Skeleton className="h-8 w-72" />
        <Skeleton className="h-64" />
      </div>
    )
  }
  if (isError || !round) return <Callout tone="destructive" title="That round could not be loaded." />

  const mayChange = canDispatch(roles)
  const drivers = (day.data?.rounds ?? []).map((r) => ({ driverId: r.driverId, driverName: r.driverName }))
  const holder = drivers.find((d) => d.driverId === round.driverId)?.driverName ?? "This driver"
  const now = new Date()
  const opening = roundOpenState(round, now)
  const late = day.data?.rounds.find((r) => r.round.id === round.id)?.isLate ?? false
  const finished = round.status === "completed" || round.status === "cancelled"
  const byId = new Map(round.stops.map((s) => [s.stopId, s]))
  const done = round.stops.filter((s) => s.status === "completed" || s.status === "done").length

  return (
    <>
      <PageHeader
        back={{ label: "Dispatch", link: { to: "/orders/assignments" } }}
        title={
          <>
            {round.kind === "collection" ? "Collection run" : "Delivery round"}
            <StatusWord
              tone={round.status === "completed" ? "done" : round.status === "cancelled" ? "quiet" : "waiting"}
            >
              {round.stageLabel ?? round.status.replace("_", " ")}
            </StatusWord>
            {late ? (
              <span className="bo-late">
                <Clock aria-hidden="true" />
                Late
              </span>
            ) : null}
          </>
        }
        meta={
          <>
            <span>
              <UserRound aria-hidden="true" />
              {holder}
            </span>
            <span>
              <CalendarClock aria-hidden="true" />
              {opening.text ? `${opening.text} · ` : ""}due {momentText(round.deadlineAt, now)}
              {opening.open ? "" : " · the driver can see it but cannot start it yet"}
            </span>
            {round.outOfOrder ? <span>Worked out of order</span> : null}
          </>
        }
        actions={
          mayChange && !finished ? (
            <>
              <ReassignDialog
                roundId={round.id}
                currentDriverName={holder}
                expectedUpdatedAt={round.updatedAt}
                drivers={drivers.filter((d) => d.driverId !== round.driverId)}
              />
              {!round.waiver ? <WaiveSequenceButton roundId={round.id} driverName={holder} /> : null}
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" disabled={editing.takingBack}>
                    <Undo2 aria-hidden="true" />
                    {editing.takingBack ? "Taking back…" : "Take this round back"}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Take this round back from {holder}?</AlertDialogTitle>
                    <AlertDialogDescription>
                      The whole round leaves their work at once. Nothing is cancelled for the customer.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <ul className="list-disc space-y-1.5 pl-5 text-sm">
                    <li>
                      Packages not yet loaded go back to <span className="font-medium">Needs a driver</span>, and
                      auto-assign tries again on its next pass.
                    </li>
                    <li>Anything already in the van stays with the driver until it is returned or delivered.</li>
                    <li>The driver's app tells them “This round was moved”.</li>
                  </ul>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Keep it with {holder.split(" ")[0]}</AlertDialogCancel>
                    <AlertDialogAction onClick={editing.takeBack}>Take this round back</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </>
          ) : undefined
        }
      />

      {round.waiver ? (
        <Callout tone="muted" title={`Allowed to go ahead by ${round.waiver.staffName}`}>
          {round.waiver.reason}
        </Callout>
      ) : null}
      {editing.error ? <Callout tone="destructive" title={editing.error} /> : null}

      <Panel
        title={
          <span id="stops-heading">
            Stops{" "}
            <span className="font-normal text-muted-foreground">
              · {done} of {round.stops.length} done
            </span>
          </span>
        }
        icon={<Route aria-hidden="true" />}
        description={
          mayChange
            ? "Use a stop's arrows to change the order the driver sees. Nothing changes until you save."
            : undefined
        }
        actions={
          mayChange && editing.dirty ? (
            <>
              <Button variant="ghost" size="sm" onClick={editing.discard}>
                Discard
              </Button>
              <Button size="sm" onClick={editing.save} disabled={editing.saving}>
                {editing.saving ? "Saving…" : "Save this order"}
              </Button>
            </>
          ) : undefined
        }
        flush
      >
        {round.stops.length === 0 ? (
          <div className="p-5">
            <EmptyState icon={Route} title="No stops on this round." />
          </div>
        ) : (
          <ol>
            {editing.order.map((id, i) => {
              const s = byId.get(id)
              if (!s) return null
              const moved = s.seq !== null && s.seq !== i + 1 && editing.dirty
              const note = windowNoteFor(s, now)
              return (
                <li key={id} className="flex items-center gap-3 border-b border-border px-5 py-3 last:border-b-0">
                  <span className="bo-avatar bo-avatar--sq size-6.5! text-[11px]!" aria-hidden="true">
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{s.label}</span>
                      {s.orderNumber ? (
                        <span className="bo-code text-xs text-muted-foreground">{s.orderNumber}</span>
                      ) : null}
                      {moved ? <span className="bo-tag">Moved</span> : null}
                    </div>
                    <div className="bo-sub">
                      {[note?.text, s.zoneName ?? "No area", s.handovers ? handoverCounts(s.handovers) : null]
                        .filter(Boolean)
                        .join(" · ")}
                      {note && WINDOW_STATE_LABEL[note.state] ? (
                        <span className="ml-1 font-medium text-foreground">· {WINDOW_STATE_LABEL[note.state]}</span>
                      ) : null}
                    </div>
                  </div>
                  <span className="text-xs text-muted-foreground max-md:hidden">{s.status.replace("_", " ")}</span>
                  {mayChange && !finished ? (
                    <div className="flex gap-1">
                      <button
                        type="button"
                        className="bo-iconbtn"
                        aria-label={`Move stop ${i + 1} earlier`}
                        disabled={i === 0}
                        onClick={() => editing.move(i, -1)}
                      >
                        <ChevronUp aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        className="bo-iconbtn"
                        aria-label={`Move stop ${i + 1} later`}
                        disabled={i === editing.order.length - 1}
                        onClick={() => editing.move(i, 1)}
                      >
                        <ChevronDown aria-hidden="true" />
                      </button>
                    </div>
                  ) : null}
                </li>
              )
            })}
          </ol>
        )}
      </Panel>
    </>
  )
}

export function handoverCounts(h: { scan: number; typed: number; manual: number }): string {
  return [
    h.scan ? `${h.scan} scanned` : null,
    h.typed ? `${h.typed} typed` : null,
    h.manual ? `${h.manual} by hand` : null,
  ]
    .filter(Boolean)
    .join(" · ")
}
