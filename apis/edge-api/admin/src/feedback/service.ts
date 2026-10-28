import { logger, offsetListPage } from "@effy/edge-shared"
import { sendEmail } from "@effy/email-kit/send"
import {
  FEEDBACK_CATEGORY_LABELS,
  FEEDBACK_NOTE_MAX,
  FEEDBACK_REPLY_MAX,
  FEEDBACK_SETTABLE_STATUSES,
  type FeedbackDetailDTO,
  type FeedbackListDTO,
  type FeedbackListItemDTO,
  type FeedbackStatus,
  type FeedbackSubmitter,
} from "@effy/shared-types"

import * as repo from "./repository"
import type { FeedbackListRequest } from "./list"
import { FeedbackError, type StaffActor, type SubmissionRow } from "./types"

const PREVIEW_MAX = 140

function submitterOf(row: SubmissionRow): FeedbackSubmitter {
  return {
    kind: row.customer_id ? "customer" : "guest",
    name: row.submitter_name,
    email: row.submitter_email,
    emailVerified: row.email_verified,
  }
}

function toListItem(row: SubmissionRow): FeedbackListItemDTO {
  return {
    referenceCode: row.reference_code,
    category: row.category,
    status: row.status,
    rating: row.rating,
    submitter: submitterOf(row),
    preview: row.message.length > PREVIEW_MAX ? `${row.message.slice(0, PREVIEW_MAX)}…` : row.message,
    source: row.source,
    platform: row.platform,
    hasEmail: Boolean(row.submitter_email),
    createdAt: row.created_at.toISOString(),
  }
}

export async function list(req: FeedbackListRequest): Promise<FeedbackListDTO> {
  const r = await repo.list(req)
  return offsetListPage(r.rows.map(toListItem), req, r)
}

export const viewCounts = (req: FeedbackListRequest) => repo.viewCounts(req)

export async function detail(referenceCode: string): Promise<FeedbackDetailDTO> {
  const row = await repo.getByReference(referenceCode)
  if (!row) throw new FeedbackError("not_found", "no feedback with that reference")

  const [replies, notes] = await Promise.all([
    repo.listReplies(referenceCode),
    repo.listNotes(referenceCode),
  ])

  return {
    referenceCode: row.reference_code,
    category: row.category,
    status: row.status,
    rating: row.rating,
    message: row.message,
    submitter: submitterOf(row),
    source: row.source,
    platform: row.platform,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    canReply: Boolean(row.submitter_email),
    replies: replies.map((r) => ({
      body: r.body,
      staffName: r.staff_name,
      sentAt: r.sent_at.toISOString(),
    })),
    notes: notes.map((n) => ({
      body: n.body,
      staffName: n.staff_name,
      createdAt: n.created_at.toISOString(),
    })),
  }
}

export async function changeStatus(referenceCode: string, status: unknown): Promise<void> {
  // `replied` is set only by a successful reply, never by hand.
  if (
    typeof status !== "string" ||
    !(FEEDBACK_SETTABLE_STATUSES as readonly string[]).includes(status)
  ) {
    throw new FeedbackError("validation", "not a settable status")
  }
  const ok = await repo.updateStatus(referenceCode, status as FeedbackStatus)
  if (!ok) throw new FeedbackError("not_found", "no feedback with that reference")
}

export async function addNote(referenceCode: string, body: unknown, actor: StaffActor): Promise<void> {
  const text = typeof body === "string" ? body.trim() : ""
  if (text.length === 0 || text.length > FEEDBACK_NOTE_MAX) {
    throw new FeedbackError("validation", "a note of 1..N characters is required")
  }
  const ok = await repo.insertNote(referenceCode, text, actor)
  if (!ok) throw new FeedbackError("not_found", "no feedback with that reference")
}

/** The email goes first; only a successful send writes the reply and sets `replied`. */
export async function reply(referenceCode: string, body: unknown, actor: StaffActor): Promise<void> {
  const text = typeof body === "string" ? body.trim() : ""
  if (text.length === 0 || text.length > FEEDBACK_REPLY_MAX) {
    throw new FeedbackError("validation", "a reply of 1..N characters is required")
  }

  const row = await repo.getByReference(referenceCode)
  if (!row) throw new FeedbackError("not_found", "no feedback with that reference")
  if (!row.submitter_email) {
    throw new FeedbackError("conflict", "this submission has no address to reply to")
  }

  try {
    await sendEmail(
      "feedback-reply",
      {
        replyBody: text,
        originalMessage: row.message,
        category: FEEDBACK_CATEGORY_LABELS[row.category],
        referenceCode: row.reference_code,
      },
      { to: row.submitter_email, audience: "customer" },
      logger,
    )
  } catch (err) {
    logger.error({ msg: "feedback.reply_send_failed", referenceCode }, "feedback reply email failed to send")
    throw new FeedbackError("send_failed", "the reply email could not be sent")
  }

  const written = await repo.insertReplyAndMarkReplied(referenceCode, text, actor)
  if (!written) throw new FeedbackError("not_found", "no feedback with that reference")

  // Without the address.
  logger.info({ msg: "feedback.replied", referenceCode, category: row.category }, "feedback reply sent")
}

