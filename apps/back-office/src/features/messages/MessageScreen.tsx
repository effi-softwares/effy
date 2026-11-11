import { useState } from "react"

import { useQuery } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import { CalendarClock, Copy, Pencil, Send, Users } from "lucide-react"

import type { MessageDTO } from "@effy/shared-types"
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
import {
  Callout,
  DetailPageSkeleton,
  DetailRows,
  MoreActions,
  PageHeader,
  Panel,
  PanelSkeleton,
} from "@effy/web-kit/patterns"
import { tourStatus, useTourPage } from "@effy/web-kit/tour"

import { useSessionRoles } from "@/features/auth/useSessionRoles"
import { api } from "@/lib/api"

import { canManageMessages } from "./access"
import { ReportTable } from "./components/ReportTable"
import { SendSheet } from "./components/SendSheet"
import { TestSendDialog } from "./components/TestSendDialog"
import { messageError } from "./errorText"
import { MessageStatusWord } from "./MessagesListScreen"
import { MESSAGES_ROOT, messageQuery, useMessageAction } from "./queries"
import { AUDIENCE_WORD, destinationWords, filterWords, KIND_WORD, whenWords } from "./words"

type Act = "cancel" | "stop" | "withdraw"

const CONFIRM: Record<Act, { title: string; body: string; verb: string }> = {
  cancel: {
    title: "Cancel this message?",
    body: "Nobody gets it. You can duplicate it later to send it after all.",
    verb: "Cancel message",
  },
  stop: {
    title: "Stop sending?",
    body: "Nobody else gets it. People who already have it keep it.",
    verb: "Stop sending",
  },
  withdraw: {
    title: "Withdraw this message?",
    body: "This removes it from everyone's inbox, and any notification not yet shown is never sent. Notifications already shown on phones can't be taken back.",
    verb: "Withdraw",
  },
}

function MessageSkeleton() {
  return (
    <DetailPageSkeleton
      back={{ label: "Messages", link: { to: "/messages" } }}
      meta={3}
      main={
        <>
          <PanelSkeleton title="What happened" />
          <PanelSkeleton title="What it says" />
        </>
      }
      aside={<PanelSkeleton title="Who it's for" />}
    />
  )
}

/** One message (112 US3): what it says, who it's for, the report, and stop, withdraw, duplicate and activity. */
export function MessageScreen({ messageId }: { messageId: string }) {
  const q = useQuery(messageQuery(messageId))
  useTourPage("message", { status: tourStatus(q) })
  useHeaderDetail(q.data?.title ?? null)
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />
  if (!q.data) return <MessageSkeleton />
  return <Loaded m={q.data} />
}

function Loaded({ m }: { m: MessageDTO }) {
  const canManage = canManageMessages(useSessionRoles())
  const activity = useActivityAction()
  const act = useMessageAction(m.id)
  const [confirming, setConfirming] = useState<Act | null>(null)
  const [sending, setSending] = useState(false)
  const [testing, setTesting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const editable = m.status === "draft" || m.status === "scheduled"

  const run = (action: Act) => {
    setError(null)
    act.mutate(
      { action, version: m.version },
      { onSuccess: () => setConfirming(null), onError: (e) => setError(messageError(e)) },
    )
  }

  const moves: { act: Act; label: string }[] = [
    ...(m.status === "scheduled" ? [{ act: "cancel" as const, label: "Cancel" }] : []),
    ...(m.status === "sending" ? [{ act: "stop" as const, label: "Stop sending" }] : []),
    ...(["sending", "sent", "stopped"].includes(m.status) ? [{ act: "withdraw" as const, label: "Withdraw" }] : []),
  ]

  return (
    <>
      <PageHeader
        back={{ label: "Messages", link: { to: "/messages" } }}
        title={
          <span className="flex flex-wrap items-center gap-3">
            {m.title}
            <MessageStatusWord status={m.status} />
          </span>
        }
        meta={
          <>
            <span>
              <Send aria-hidden="true" />
              {KIND_WORD[m.kind]}
            </span>
            <span>
              <Users aria-hidden="true" />
              {m.audiences.map((a) => AUDIENCE_WORD[a.audience]).join(", ")}
            </span>
            <span>
              <CalendarClock aria-hidden="true" />
              {m.sentAt
                ? `Sent ${whenWords(m.sentAt)}`
                : m.sendAt
                  ? m.status === "scheduled"
                    ? `Sends ${whenWords(m.sendAt)}`
                    : `Started ${whenWords(m.sendAt)}`
                  : `Written ${whenWords(m.createdAt)}`}
            </span>
          </>
        }
        actions={
          <>
            {canManage && editable ? (
              <Button variant="outline" asChild>
                <Link to="/messages/$messageId/edit" params={{ messageId: m.id }}>
                  <Pencil aria-hidden="true" />
                  Edit
                </Link>
              </Button>
            ) : null}
            {editable && (canManage || m.kind === "direct") ? (
              <Button onClick={() => setSending(true)}>
                <Send aria-hidden="true" />
                Send…
              </Button>
            ) : null}
            {canManage && moves[0] ? (
              <Button
                data-tour="messages.actions"
                variant="outline"
                disabled={act.isPending}
                onClick={() => setConfirming(moves[0]!.act)}
              >
                {moves[0].label}
              </Button>
            ) : null}
            <MoreActions
              tour="page-more"
              actions={[
                activity,
                canManage && editable ? { label: "Send to me", onSelect: () => setTesting(true) } : null,
                canManage
                  ? { label: "Duplicate", icon: Copy, link: { to: "/messages/new", search: { from: m.id } } }
                  : null,
                ...(canManage
                  ? moves
                      .slice(1)
                      .map((x) => ({
                        label: x.label,
                        destructive: x.act === "withdraw",
                        onSelect: () => setConfirming(x.act),
                      }))
                  : []),
              ]}
            />
          </>
        }
      />

      <ActivityLogDrawer
        app="back-office"
        log="bo-message"
        title="Message activity"
        description={`${m.title} - who wrote, tested, sent, stopped or withdrew it, and when.`}
        api={api}
        path={`/admin/v1/messages/${m.id}/activity`}
        queryKey={[...MESSAGES_ROOT, "detail", m.id]}
        fileName={`message-${m.title}-activity`}
      />

      {error ? (
        <Callout tone="destructive" title="That didn't work">
          {error}
        </Callout>
      ) : null}
      {m.status === "not_sent" ? (
        <Callout tone="destructive" title="Not sent: more people than one message may reach">
          Narrow who it's for and send it again: duplicate it to start from these words.
        </Callout>
      ) : null}
      {m.status === "withdrawn" ? (
        <Callout tone="muted" title={`Withdrawn ${whenWords(m.withdrawnAt)}`}>
          It's gone from every inbox. Notifications already shown on phones stayed.
        </Callout>
      ) : null}

      <div className="ef-detail">
        <div className="ef-detail__main">
          <Panel
            tour="messages.report"
            title="What happened"
            description={m.reportFrozenAt ? `Final numbers as of ${whenWords(m.reportFrozenAt)}.` : undefined}
            flush={Boolean(m.total)}
          >
            <ReportTable message={m} />
          </Panel>
          <Panel title="What it says">
            <div className="space-y-3">
              {m.pictureUrl ? (
                <img
                  src={m.pictureUrl}
                  alt=""
                  className="aspect-video w-full max-w-md rounded-md border object-cover"
                />
              ) : null}
              <p className="text-base font-semibold">{m.title}</p>
              <p className="whitespace-pre-line text-sm">{m.body}</p>
            </div>
          </Panel>
        </div>
        <aside className="ef-detail__aside">
          <Panel title="Who it's for">
            <DetailRows
              rows={[
                ...m.audiences.map((a) => ({
                  key: a.audience,
                  label: AUDIENCE_WORD[a.audience],
                  value: filterWords(a.audience, a.filter),
                })),
                ...m.audiences.map((a) => ({
                  key: `${a.audience}-tap`,
                  label: m.audiences.length > 1 ? `${AUDIENCE_WORD[a.audience]}: a tap opens` : "A tap opens",
                  value: destinationWords(a.destination),
                })),
                { key: "push", label: "Phone notification", value: m.push ? "Yes" : "No, inbox only" },
                { key: "ends", label: "Ends", value: m.endsAt ? whenWords(m.endsAt) : "No end" },
                { key: "by", label: "Written by", value: m.createdBy },
              ]}
            />
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
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction onClick={() => confirming && run(confirming)}>
              {confirming ? CONFIRM[confirming].verb : ""}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <SendSheet
        message={m}
        open={sending}
        onOpenChange={setSending}
        canSchedule={canManage}
        onSent={() => undefined}
      />
      <TestSendDialog message={m} open={testing} onOpenChange={setTesting} />
    </>
  )
}
