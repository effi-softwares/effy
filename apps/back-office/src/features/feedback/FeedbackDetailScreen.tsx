import { useState } from "react"

import { useQuery } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"

import {
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from "@effy/design-system/ui"
import { ErrorState } from "@effy/web-kit/console"

import { sessionQuery } from "@/features/auth/queries"

import { canReplyFeedback } from "./access"
import {
  FEEDBACK_CATEGORY_LABELS,
  FEEDBACK_NOTE_MAX,
  FEEDBACK_REPLY_MAX,
  FEEDBACK_SETTABLE_STATUSES,
  FEEDBACK_STATUS_LABELS,
  type FeedbackDetailDTO,
} from "./model"
import {
  feedbackDetailQuery,
  useAddFeedbackNote,
  useReplyToFeedback,
  useSetFeedbackStatus,
} from "./queries"

/**
 * One feedback submission (046 US2/US3).
 *
 * ⚠ The submission's CONTEXT is immutable and read-only here; only status, notes and replies change.
 * Internal notes are staff-only — they are NEVER emailed or shown to the submitter (FR-024/FR-038).
 * The reply composer is admin/manager-only (research D7) and disabled when there is no address.
 */
export function FeedbackDetailScreen({ referenceCode }: { referenceCode: string }) {
  const { data, isPending, isError, error, refetch } = useQuery(feedbackDetailQuery(referenceCode))
  const { data: session } = useQuery(sessionQuery)
  const roles = session?.status === "signed-in" ? session.identity.roles : []
  const mayReply = canReplyFeedback(roles)

  if (isError) return <ErrorState error={error} onRetry={() => void refetch()} />
  if (isPending) return <p className="text-sm text-muted-foreground">Loading…</p>

  return (
    <div className="max-w-3xl space-y-8">
      <div>
        <Link to="/feedback" className="text-sm text-primary hover:underline">
          ← All feedback
        </Link>
        <h1 className="mt-2 font-mono text-2xl font-semibold tracking-tight">{data.referenceCode}</h1>
      </div>

      <Context detail={data} />
      <Message message={data.message} />
      <StatusControl detail={data} />
      <Notes detail={data} />
      <Replies detail={data} mayReply={mayReply} />
    </div>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[8rem_1fr] gap-2 border-b py-2 text-sm last:border-b-0">
      <dt className="text-muted-foreground">{label}</dt>
      <dd>{children}</dd>
    </div>
  )
}

function Context({ detail }: { detail: FeedbackDetailDTO }) {
  const s = detail.submitter
  return (
    <section>
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Details</h2>
      <dl>
        <Row label="Category">{FEEDBACK_CATEGORY_LABELS[detail.category]}</Row>
        <Row label="Status">{FEEDBACK_STATUS_LABELS[detail.status]}</Row>
        <Row label="Rating">{detail.rating ? `${detail.rating}/5` : "—"}</Row>
        <Row label="From">
          {s.kind === "customer" ? "Signed-in customer" : "Guest"}
          {s.name ? ` · ${s.name}` : ""}
        </Row>
        <Row label="Email">
          {s.email ? (
            <>
              {s.email}{" "}
              <span className="text-xs text-muted-foreground">
                ({s.emailVerified ? "verified" : "unverified"})
              </span>
            </>
          ) : (
            <span className="text-muted-foreground">none — cannot reply</span>
          )}
        </Row>
        <Row label="Source">{detail.source}</Row>
        <Row label="Platform">{detail.platform}</Row>
        <Row label="Received">{new Date(detail.createdAt).toLocaleString()}</Row>
      </dl>
    </section>
  )
}

function Message({ message }: { message: string }) {
  return (
    <section>
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Message</h2>
      {/* ⚠ `whitespace-pre-wrap` on plain text — React escapes it, so pasted markup renders inert (FR-017). */}
      <p className="whitespace-pre-wrap rounded-md border bg-muted/30 p-4 text-sm">{message}</p>
    </section>
  )
}

function StatusControl({ detail }: { detail: FeedbackDetailDTO }) {
  const mutation = useSetFeedbackStatus(detail.referenceCode)
  return (
    <section>
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Status</h2>
      <div className="flex items-center gap-3">
        <Select
          value={FEEDBACK_SETTABLE_STATUSES.includes(detail.status) ? detail.status : ""}
          onValueChange={(v) => mutation.mutate(v)}
          disabled={mutation.isPending}
        >
          <SelectTrigger className="w-56">
            <SelectValue placeholder={FEEDBACK_STATUS_LABELS[detail.status]} />
          </SelectTrigger>
          <SelectContent>
            {FEEDBACK_SETTABLE_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {FEEDBACK_STATUS_LABELS[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {detail.status === "replied" && (
          <span className="text-xs text-muted-foreground">
            Marked replied automatically when a reply was sent.
          </span>
        )}
      </div>
    </section>
  )
}

function Notes({ detail }: { detail: FeedbackDetailDTO }) {
  const [body, setBody] = useState("")
  const mutation = useAddFeedbackNote(detail.referenceCode)

  async function add() {
    if (body.trim().length === 0) return
    try {
      await mutation.mutateAsync(body.trim())
      setBody("")
    } catch {
      /* surfaced below */
    }
  }

  return (
    <section>
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        Internal notes
      </h2>
      <p className="mb-3 text-xs text-muted-foreground">
        Only staff can see these. They are never emailed or shown to the submitter.
      </p>

      {detail.notes.length === 0 ? (
        <p className="text-sm text-muted-foreground">No notes yet.</p>
      ) : (
        <ul className="space-y-3">
          {detail.notes.map((n, i) => (
            <li key={i} className="rounded-md border p-3 text-sm">
              <p className="whitespace-pre-wrap">{n.body}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {n.staffName ?? "Staff"} · {new Date(n.createdAt).toLocaleString()}
              </p>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4 space-y-2">
        <Textarea
          value={body}
          maxLength={FEEDBACK_NOTE_MAX}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Add an internal note…"
          rows={3}
        />
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" disabled={mutation.isPending || body.trim().length === 0} onClick={add}>
            {mutation.isPending ? "Saving…" : "Add note"}
          </Button>
          {mutation.isError && <span className="text-xs text-destructive">Couldn&rsquo;t save that note.</span>}
        </div>
      </div>
    </section>
  )
}

function Replies({ detail, mayReply }: { detail: FeedbackDetailDTO; mayReply: boolean }) {
  const [body, setBody] = useState("")
  const mutation = useReplyToFeedback(detail.referenceCode)

  async function send() {
    if (body.trim().length === 0) return
    try {
      await mutation.mutateAsync(body.trim())
      setBody("")
    } catch {
      /* surfaced below */
    }
  }

  return (
    <section>
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Replies</h2>

      {detail.replies.length === 0 ? (
        <p className="text-sm text-muted-foreground">No replies sent yet.</p>
      ) : (
        <ul className="space-y-3">
          {detail.replies.map((r, i) => (
            <li key={i} className="rounded-md border bg-muted/30 p-3 text-sm">
              <p className="whitespace-pre-wrap">{r.body}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {r.staffName ?? "Staff"} · {new Date(r.sentAt).toLocaleString()}
              </p>
            </li>
          ))}
        </ul>
      )}

      {/* ⚠ Reply is gated three ways: role (admin/manager), and a submitter email to send to. */}
      {!mayReply ? (
        <p className="mt-4 text-sm text-muted-foreground">
          Only a manager or admin can send a reply.
        </p>
      ) : !detail.canReply ? (
        <p className="mt-4 text-sm text-muted-foreground">
          This submission has no email address, so there is nowhere to send a reply.
        </p>
      ) : (
        <div className="mt-4 space-y-2">
          <Textarea
            value={body}
            maxLength={FEEDBACK_REPLY_MAX}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Write a reply — it will be emailed to the submitter…"
            rows={5}
          />
          <div className="flex items-center gap-3">
            <Button disabled={mutation.isPending || body.trim().length === 0} onClick={send}>
              {mutation.isPending ? "Sending…" : "Send reply"}
            </Button>
            {mutation.isError && (
              <span className="text-xs text-destructive">
                The reply wasn&rsquo;t delivered. It was not marked as replied — try again.
              </span>
            )}
          </div>
        </div>
      )}
    </section>
  )
}
