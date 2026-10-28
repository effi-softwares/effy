import { useState } from "react"

import { Link } from "@tanstack/react-router"
import { ExternalLink, Lock, Reply, Send } from "lucide-react"

import { cn } from "@effy/design-system"
import {
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Tabs,
  TabsList,
  TabsTrigger,
  Textarea,
} from "@effy/design-system/ui"

import { StatusWord, Timeline, TimelineItem, type StatusTone } from "@effy/web-kit/patterns"
import { moment } from "@/lib/format"

import {
  FEEDBACK_CATEGORY_LABELS,
  FEEDBACK_NOTE_MAX,
  FEEDBACK_REPLY_MAX,
  FEEDBACK_SETTABLE_STATUSES,
  FEEDBACK_STATUS_LABELS,
  type FeedbackDetailDTO,
  type FeedbackStatus,
} from "./model"
import { useAddFeedbackNote, useReplyToFeedback, useSetFeedbackStatus } from "./queries"

const STATUS_TONE: Record<FeedbackStatus, StatusTone> = {
  new: "info",
  in_review: "moving",
  replied: "done",
  resolved: "done",
  archived: "quiet",
  spam: "quiet",
}

export function FeedbackPanel({
  detail,
  mayReply,
  showOpenLink = false,
}: {
  detail: FeedbackDetailDTO
  mayReply: boolean
  showOpenLink?: boolean
}) {
  const s = detail.submitter
  const timeline = [
    ...detail.notes.map((n) => ({ kind: "note" as const, body: n.body, who: n.staffName ?? "Staff", at: n.createdAt })),
    ...detail.replies.map((r) => ({ kind: "reply" as const, body: r.body, who: r.staffName ?? "Staff", at: r.sentAt })),
  ].sort((a, b) => a.at.localeCompare(b.at))

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-6 py-4 max-md:px-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="font-mono text-lg font-semibold">{detail.referenceCode}</h2>
            <StatusWord tone={STATUS_TONE[detail.status]}>{FEEDBACK_STATUS_LABELS[detail.status]}</StatusWord>
          </div>
          <p className="mt-0.5 block text-sm text-muted-foreground">
            {FEEDBACK_CATEGORY_LABELS[detail.category]}
            {detail.rating ? ` · ${detail.rating}/5` : ""}
            {s.name ? ` · ${s.name}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <StatusControl detail={detail} />
          {showOpenLink ? (
            <Button variant="ghost" size="icon" asChild>
              <Link
                to="/feedback/$referenceCode"
                params={{ referenceCode: detail.referenceCode }}
                aria-label="Open full page"
              >
                <ExternalLink aria-hidden="true" />
              </Link>
            </Button>
          ) : null}
        </div>
      </div>

      <div className="grid flex-1 xl:grid-cols-3">
        <div className="min-w-0 space-y-6 border-border p-6 max-md:p-4 xl:col-span-2 xl:border-r">
          <p className="rounded-lg bg-muted p-4 text-sm whitespace-pre-wrap">{detail.message}</p>

          {timeline.length > 0 ? (
            <Timeline>
              {timeline.map((t, i) => (
                <TimelineItem
                  key={i}
                  icon={t.kind === "note" ? <Lock /> : <Reply />}
                  tone={t.kind === "reply" ? "done" : "default"}
                  title={`${t.kind === "note" ? "Internal note" : "Reply sent"} · ${t.who}`}
                  time={moment(t.at)}
                  note={t.body}
                  noteTone={t.kind === "note" ? "primary" : "muted"}
                />
              ))}
            </Timeline>
          ) : null}

          <Composer detail={detail} mayReply={mayReply} />
        </div>

        <div className="min-w-0 space-y-4 p-6 max-md:p-4">
          <h3 className="text-xs font-medium text-muted-foreground">Details</h3>
          <dl className="ef-dl [&_.ef-dl__row]:grid-cols-[minmax(0,1fr)] [&_.ef-dl__row]:gap-1">
            <Row label="Category">{FEEDBACK_CATEGORY_LABELS[detail.category]}</Row>
            <Row label="Rating">{detail.rating ? `${detail.rating}/5` : "—"}</Row>
            <Row label="From">
              {s.kind === "customer" ? "Signed-in customer" : "Guest"}
              {s.name ? ` · ${s.name}` : ""}
            </Row>
            <Row label="Email">
              {s.email ? (
                <>
                  {s.email}{" "}
                  <span className="text-xs text-muted-foreground">({s.emailVerified ? "verified" : "unverified"})</span>
                </>
              ) : (
                <span className="text-muted-foreground">none — cannot reply</span>
              )}
            </Row>
            <Row label="Source">{detail.source}</Row>
            <Row label="Platform">{detail.platform}</Row>
            <Row label="Received">{moment(detail.createdAt)}</Row>
          </dl>
        </div>
      </div>
    </div>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="ef-dl__row">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  )
}

function StatusControl({ detail }: { detail: FeedbackDetailDTO }) {
  const mutation = useSetFeedbackStatus(detail.referenceCode)
  return (
    <Select
      value={FEEDBACK_SETTABLE_STATUSES.includes(detail.status) ? detail.status : ""}
      onValueChange={(v) => mutation.mutate(v)}
      disabled={mutation.isPending}
    >
      <SelectTrigger size="sm" className="w-40" aria-label="Status">
        <SelectValue placeholder={FEEDBACK_STATUS_LABELS[detail.status]} />
      </SelectTrigger>
      <SelectContent>
        {FEEDBACK_SETTABLE_STATUSES.map((st) => (
          <SelectItem key={st} value={st}>
            {FEEDBACK_STATUS_LABELS[st]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

function Composer({ detail, mayReply }: { detail: FeedbackDetailDTO; mayReply: boolean }) {
  const canSend = mayReply && detail.canReply
  const [mode, setMode] = useState<"reply" | "note">(canSend ? "reply" : "note")
  const [body, setBody] = useState("")
  const reply = useReplyToFeedback(detail.referenceCode)
  const note = useAddFeedbackNote(detail.referenceCode)
  const mutation = mode === "reply" ? reply : note
  const max = mode === "reply" ? FEEDBACK_REPLY_MAX : FEEDBACK_NOTE_MAX

  async function submit() {
    if (body.trim().length === 0) return
    try {
      await mutation.mutateAsync(body.trim())
      setBody("")
    } catch {}
  }

  return (
    <div className="space-y-2">
      <Tabs value={mode} onValueChange={(v) => setMode(v as "reply" | "note")}>
        <TabsList aria-label="Write">
          <TabsTrigger value="reply">
            <Reply aria-hidden="true" />
            Reply
          </TabsTrigger>
          <TabsTrigger value="note">
            <Lock aria-hidden="true" />
            Internal note
          </TabsTrigger>
        </TabsList>
      </Tabs>
      {mode === "reply" && !mayReply ? (
        <p className="text-sm text-muted-foreground">Only a manager or admin can send a reply.</p>
      ) : mode === "reply" && !detail.canReply ? (
        <p className="text-sm text-muted-foreground">
          This submission has no email address, so there is nowhere to send a reply.
        </p>
      ) : (
        <div
          className={cn(
            "rounded-lg border border-input bg-background shadow-xs focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50",
            mode === "note" && "bg-muted",
          )}
        >
          <label className="sr-only" htmlFor="fb-compose">
            {mode === "reply" ? "Reply" : "Internal note"}
          </label>
          <Textarea
            id="fb-compose"
            rows={4}
            className="min-h-16 resize-none rounded-none border-0 bg-transparent shadow-none focus-visible:ring-0 dark:bg-transparent"
            value={body}
            maxLength={max}
            onChange={(e) => setBody(e.target.value)}
            placeholder={
              mode === "reply" ? "Write a reply — it will be emailed to the submitter…" : "Add an internal note…"
            }
          />
          <div className="flex items-center justify-between gap-2 border-t border-t-border py-2 pr-2 pl-3">
            <span className="text-xs text-muted-foreground">
              {mode === "reply" && detail.submitter.email ? `To ${detail.submitter.email} · ` : "Staff only · "}
              {body.length} / {max}
            </span>
            <Button size="sm" disabled={mutation.isPending || body.trim().length === 0} onClick={() => void submit()}>
              {mode === "reply" ? <Send aria-hidden="true" /> : null}
              {mutation.isPending
                ? mode === "reply"
                  ? "Sending…"
                  : "Saving…"
                : mode === "reply"
                  ? "Send reply"
                  : "Add note"}
            </Button>
          </div>
        </div>
      )}
      {reply.isError && mode === "reply" ? (
        <p className="text-xs font-medium">
          The reply wasn&rsquo;t delivered. It was not marked as replied — try again.
        </p>
      ) : null}
      {note.isError && mode === "note" ? <p className="text-xs font-medium">Couldn&rsquo;t save that note.</p> : null}
      <p className="text-xs text-muted-foreground">
        Sending a reply marks it Replied automatically. A note is never emailed or shown to the submitter.
      </p>
    </div>
  )
}
