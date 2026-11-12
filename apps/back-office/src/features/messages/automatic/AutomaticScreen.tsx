import { useState } from "react"

import { useQuery } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import { CalendarClock, Pause, Pencil, Play, Repeat, Users } from "lucide-react"

import { automationWhenWords, type AutomationDTO, type AutomationRunDTO } from "@effy/shared-types"
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
} from "@effy/design-system/ui"
import { ActivityLogDrawer, useActivityAction } from "@effy/web-kit/activity-log"
import { ErrorState, useHeaderDetail } from "@effy/web-kit/console"
import { StaticTable, type EffyColumnDef } from "@effy/web-kit/data-table"
import { Callout, DetailPageSkeleton, DetailRows, MoreActions, PageHeader, Panel, PanelSkeleton } from "@effy/web-kit/patterns"
import { tourStatus, useTourPage } from "@effy/web-kit/tour"

import { useSessionRoles } from "@/features/auth/useSessionRoles"
import { api } from "@/lib/api"

import { canManageMessages } from "../access"
import { messageError } from "../errorText"
import { AUDIENCE_WORD, destinationWords, filterWords, KIND_WORD, whenWords } from "../words"
import { AutomationStatusWord } from "./AutomaticListScreen"
import { AUTOMATIONS_ROOT, automationQuery, useAutomationState } from "./queries"
import { automationActivityPath } from "./repo"
import { AUTOMATIC_RULES, MODE_WORD, RUN_WORD, TRIGGER_ONCE } from "./words"

function AutomaticSkeleton() {
  return (
    <DetailPageSkeleton
      back={{ label: "Automatic messages", link: { to: "/messages/automatic" } }}
      meta={3}
      main={
        <>
          <PanelSkeleton title="Runs" />
          <PanelSkeleton title="What it says" />
        </>
      }
      aside={<PanelSkeleton title="Who and when" />}
    />
  )
}

const runColumns: EffyColumnDef<AutomationRunDTO>[] = [
  { id: "ran", header: "Ran", cell: ({ row }) => whenWords(row.original.ranAt), meta: { label: "Ran", identifying: true } },
  {
    id: "outcome",
    header: "What happened",
    cell: ({ row }) =>
      row.original.messageId ? (
        <Link className="link" to="/messages/$messageId" params={{ messageId: row.original.messageId }}>
          {RUN_WORD[row.original.outcome]} - see its report
        </Link>
      ) : (
        <span className="text-muted-foreground">{RUN_WORD[row.original.outcome]}</span>
      ),
    meta: { label: "What happened" },
  },
  {
    id: "matched",
    header: "People",
    cell: ({ row }) => row.original.matched.toLocaleString("en-AU"),
    meta: { label: "People", align: "numeric" },
  },
]

type Move = "pause" | "resume" | "end"

const CONFIRM: Record<Move, { title: string; body: string; verb: string }> = {
  pause: { title: "Pause it?", body: "Nothing more is sent until you resume it.", verb: "Pause" },
  resume: { title: "Resume it?", body: "It runs again from its next time. Nothing missed while it was paused is sent.", verb: "Resume" },
  end: { title: "End it?", body: "It never runs again. Messages it already sent keep their reports.", verb: "End" },
}

/** One automatic message (115 US3/US4): when it sends, what each run reached, pause, resume, end, edit and activity. */
export function AutomaticScreen({ automationId }: { automationId: string }) {
  const q = useQuery(automationQuery(automationId))
  useTourPage("automatic-message", { status: tourStatus(q) })
  useHeaderDetail(q.data?.name ?? null)
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />
  if (!q.data) return <AutomaticSkeleton />
  return <Loaded a={q.data} />
}

function Loaded({ a }: { a: AutomationDTO }) {
  const canManage = canManageMessages(useSessionRoles())
  const activity = useActivityAction()
  const state = useAutomationState(a.id)
  const [confirming, setConfirming] = useState<Move | null>(null)
  const [error, setError] = useState<string | null>(null)

  const run = (action: Move) => {
    setError(null)
    state.mutate(
      { action, version: a.version },
      { onSuccess: () => setConfirming(null), onError: (e) => setError(messageError(e)) },
    )
  }
  const primary: Move | null = a.status === "active" ? "pause" : a.status === "paused" ? "resume" : null

  return (
    <>
      <PageHeader
        back={{ label: "Automatic messages", link: { to: "/messages/automatic" } }}
        title={
          <span className="flex flex-wrap items-center gap-3">
            {a.name}
            <AutomationStatusWord status={a.status} />
          </span>
        }
        meta={
          <>
            <span>
              <Repeat aria-hidden="true" />
              {automationWhenWords(a)}
            </span>
            <span>
              <Users aria-hidden="true" />
              {KIND_WORD[a.kind]} · {AUDIENCE_WORD[a.audience]}
            </span>
            <span>
              <CalendarClock aria-hidden="true" />
              {a.nextRunAt ? `Next run ${whenWords(a.nextRunAt)}` : a.lastRunAt ? `Last ran ${whenWords(a.lastRunAt)}` : "Not run yet"}
            </span>
          </>
        }
        actions={
          <>
            {a.mayEdit ? (
              <Button variant="outline" asChild>
                <Link to="/messages/automatic/$automationId/edit" params={{ automationId: a.id }}>
                  <Pencil aria-hidden="true" />
                  Edit
                </Link>
              </Button>
            ) : null}
            {canManage && primary ? (
              <Button data-tour="automatic.actions" variant="outline" disabled={state.isPending} onClick={() => setConfirming(primary)}>
                {primary === "pause" ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}
                {primary === "pause" ? "Pause" : "Resume"}
              </Button>
            ) : null}
            <MoreActions
              tour="page-more"
              actions={[
                activity,
                canManage && a.status !== "finished" ? { label: "End", destructive: true, onSelect: () => setConfirming("end") } : null,
              ]}
            />
          </>
        }
      />

      <ActivityLogDrawer
        app="back-office"
        log="bo-automation"
        title="Automatic message activity"
        description={`${a.name} - who set it up, changed, paused, resumed or ended it, and when.`}
        api={api}
        path={automationActivityPath(a.id)}
        queryKey={[...AUTOMATIONS_ROOT, "detail", a.id]}
        fileName={`automatic-${a.name}-activity`}
      />

      {error ? (
        <Callout tone="destructive" title="That didn't work">
          {error}
        </Callout>
      ) : null}

      <div className="ef-detail">
        <div className="ef-detail__main">
          <Panel tour="automatic.runs" title="Runs" description="The latest 50. Each sent run is its own message, with its own report." flush>
            <StaticTable
              label="Runs"
              columns={runColumns}
              rows={a.runs}
              getRowId={(r) => r.id}
              framed={false}
              empty={<span className="text-sm text-muted-foreground">It hasn't run yet.</span>}
            />
          </Panel>
          <Panel title="What it says">
            <div className="space-y-3">
              <p className="text-base font-semibold">{a.title}</p>
              <p className="whitespace-pre-line text-sm">{a.body}</p>
            </div>
          </Panel>
        </div>
        <aside className="ef-detail__aside">
          <Panel title="Who and when">
            <DetailRows
              rows={[
                { key: "who", label: AUDIENCE_WORD[a.audience], value: filterWords(a.audience, a.filter) },
                { key: "tap", label: "A tap opens", value: destinationWords(a.destination) },
                { key: "mode", label: MODE_WORD[a.mode], value: automationWhenWords(a) },
                { key: "push", label: "Phone notification", value: a.push ? "Yes" : "No, inbox only" },
                ...(a.audience === "customer" ? [{ key: "email", label: "Email", value: a.email ? "Yes" : "No" }] : []),
                { key: "by", label: "Set up by", value: a.createdBy },
              ]}
            />
            <p className="mt-4 text-sm text-muted-foreground">{a.mode === "trigger" ? TRIGGER_ONCE : AUTOMATIC_RULES}</p>
          </Panel>
        </aside>
      </div>

      <AlertDialog open={confirming !== null} onOpenChange={(o) => (o ? null : setConfirming(null))}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirming ? CONFIRM[confirming].title : ""}</AlertDialogTitle>
            <AlertDialogDescription>{confirming ? CONFIRM[confirming].body : ""}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it as it is</AlertDialogCancel>
            <AlertDialogAction onClick={() => confirming && run(confirming)}>{confirming ? CONFIRM[confirming].verb : ""}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
