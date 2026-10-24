import { useState } from "react"

import { Link } from "@tanstack/react-router"
import { ExternalLink, Lock, Reply, Send } from "lucide-react"

import { cn } from "@effy/design-system"
import { Button, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@effy/design-system/ui"

import { StatusWord, type StatusTone } from "@effy/web-kit/patterns"
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

/** A feedback status as a word with its tone (New is the one that needs a person). */
export const STATUS_TONE: Record<FeedbackStatus, StatusTone> = {
  new: "info",
  in_review: "moving",
  replied: "done",
  resolved: "done",
  archived: "quiet",
  spam: "quiet",
}

/**
 * One submission (046; redesign, boards "Feedback — inbox" / "Feedback — one submission"): the
 * shopper's own words, the staff timeline — internal notes and replies — a composer for either, and
 * the details. Used beside the inbox list and as its own page.
 */
export function FeedbackPanel({ detail, mayReply, showOpenLink = false }: { detail: FeedbackDetailDTO; mayReply: boolean; showOpenLink?: boolean }) {
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
            <h2 className="bo-code text-lg font-semibold">{detail.referenceCode}</h2>
            <StatusWord tone={STATUS_TONE[detail.status]}>{FEEDBACK_STATUS_LABELS[detail.status]}</StatusWord>
          </div>
          <p className="bo-sub">
            {FEEDBACK_CATEGORY_LABELS[detail.category]}
            {detail.rating ? ` · ${detail.rating}/5` : ""}
            {s.name ? ` · ${s.name}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <StatusControl detail={detail} />
          {showOpenLink ? (
            <Button variant="ghost" size="icon-sm" asChild>
              <Link to="/feedback/$referenceCode" params={{ referenceCode: detail.referenceCode }} aria-label="Open full page">
                <ExternalLink aria-hidden="true" />
              </Link>
            </Button>
          ) : null}
        </div>
      </div>

      <div className="grid flex-1 xl:grid-cols-3">
        <div className="min-w-0 space-y-6 border-border p-6 max-md:p-4 xl:col-span-2 xl:border-r">
          {/* `whitespace-pre-wrap` on plain text — React escapes it, so pasted markup renders inert. */}
          <p className="rounded-lg bg-muted p-4 text-sm whitespace-pre-wrap">{detail.message}</p>

          {timeline.length > 0 ? (
            <ol className="bo-tl">
              {timeline.map((t, i) => (
                <li key={i} className="bo-tl__item">
                  <span className={cn("bo-tl__mark", t.kind === "reply" && "bo-tl__mark--done")} aria-hidden="true">
                    {t.kind === "note" ? <Lock /> : <Reply />}
                  </span>
                  <div>
                    <div className="bo-tl__title">
                      {t.kind === "note" ? "Internal note" : "Reply sent"} · {t.who}
                    </div>
                    <div className={cn("bo-tl__note whitespace-pre-wrap", t.kind === "note" && "bg-primary-muted!")}>{t.body}</div>
                  </div>
                  <span className="bo-tl__time">{moment(t.at)}</span>
                </li>
              ))}
            </ol>
          ) : null}

          <Composer detail={detail} mayReply={mayReply} />
        </div>

        <div className="min-w-0 space-y-4 p-6 max-md:p-4">
          <h3 className="bo-eyebrow">Details</h3>
          <dl className="bo-dl bo-dl--stack">
            <Row label="Category">{FEEDBACK_CATEGORY_LABELS[detail.category]}</Row>
            <Row label="Rating">{detail.rating ? `${detail.rating}/5` : "—"}</Row>
            <Row label="From">
              {s.kind === "customer" ? "Signed-in customer" : "Guest"}
              {s.name ? ` · ${s.name}` : ""}
            </Row>
            <Row label="Email">
              {s.email ? (
                <>
                  {s.email} <span className="text-xs text-muted-foreground">({s.emailVerified ? "verified" : "unverified"})</span>
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
    <div className="bo-dl__row">
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

/**
 * One box, two kinds of writing: a reply (emailed to the submitter; marks it Replied) or an internal
 * note (never emailed or shown to them). Reply is gated by role (admin/manager) and by there being
 * an email to send to.
 */
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
    } catch {
      /* surfaced below */
    }
  }

  return (
    <div className="space-y-2">
      <div className="bo-seg" role="tablist" aria-label="Write">
        <button type="button" role="tab" aria-selected={mode === "reply"} className={mode === "reply" ? "is-active" : undefined} onClick={() => setMode("reply")}>
          <Reply aria-hidden="true" />
          Reply
        </button>
        <button type="button" role="tab" aria-selected={mode === "note"} className={mode === "note" ? "is-active" : undefined} onClick={() => setMode("note")}>
          <Lock aria-hidden="true" />
          Internal note
        </button>
      </div>
      {mode === "reply" && !mayReply ? (
        <p className="text-sm text-muted-foreground">Only a manager or admin can send a reply.</p>
      ) : mode === "reply" && !detail.canReply ? (
        <p className="text-sm text-muted-foreground">This submission has no email address, so there is nowhere to send a reply.</p>
      ) : (
        <div className={cn("bo-composer", mode === "note" && "bo-composer--note")}>
          <label className="sr-only" htmlFor="fb-compose">
            {mode === "reply" ? "Reply" : "Internal note"}
          </label>
          <textarea
            id="fb-compose"
            rows={4}
            value={body}
            maxLength={max}
            onChange={(e) => setBody(e.target.value)}
            placeholder={mode === "reply" ? "Write a reply — it will be emailed to the submitter…" : "Add an internal note…"}
          />
          <div className="bo-composer__bar">
            <span className="text-xs text-muted-foreground">
              {mode === "reply" && detail.submitter.email ? `To ${detail.submitter.email} · ` : "Staff only · "}
              {body.length} / {max}
            </span>
            <Button size="sm" disabled={mutation.isPending || body.trim().length === 0} onClick={() => void submit()}>
              {mode === "reply" ? <Send aria-hidden="true" /> : null}
              {mutation.isPending ? (mode === "reply" ? "Sending…" : "Saving…") : mode === "reply" ? "Send reply" : "Add note"}
            </Button>
          </div>
        </div>
      )}
      {reply.isError && mode === "reply" ? (
        <p className="text-xs font-medium">The reply wasn&rsquo;t delivered. It was not marked as replied — try again.</p>
      ) : null}
      {note.isError && mode === "note" ? <p className="text-xs font-medium">Couldn&rsquo;t save that note.</p> : null}
      <p className="text-xs text-muted-foreground">Sending a reply marks it Replied automatically. A note is never emailed or shown to the submitter.</p>
    </div>
  )
}
