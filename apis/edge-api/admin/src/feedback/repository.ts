import { query, withTransaction } from "@effy/edge-shared"
import type { FeedbackStatus } from "@effy/shared-types"

import type { ListParams, NoteRow, ReplyRow, StaffActor, SubmissionRow } from "./types"

/**
 * The feedback console repository (046 US2/US3). Raw SQL, no ORM (Principle VI).
 *
 * ⚠ FILTERS ARE PARAMETERISED AND COMBINABLE (FR-020). Each active filter appends a condition and a
 * bound parameter — never string-interpolated — so a search term can contain anything. The text search
 * is an ILIKE over message + email, served by the `pg_trgm` GIN index on message.
 */

const SUBMISSION_COLUMNS = `
  reference_code, category, status, rating, message, submitter_name, submitter_email,
  email_verified, customer_id, source, platform, created_at, updated_at
`

/** Build the shared WHERE clause + params from the filter bag. */
function buildWhere(params: ListParams): { where: string; values: unknown[] } {
  const conds: string[] = []
  const values: unknown[] = []
  const p = (v: unknown) => `$${values.push(v)}`

  if (params.q) {
    const term = `%${params.q}%`
    // Two separate params so the planner can use the trigram index on message.
    conds.push(`(message ILIKE ${p(term)} OR submitter_email ILIKE ${p(term)})`)
  }
  if (params.category) conds.push(`category = ${p(params.category)}`)
  if (params.status) conds.push(`status = ${p(params.status)}`)
  if (params.rating !== null) conds.push(`rating = ${p(params.rating)}`)
  if (params.from) conds.push(`created_at >= ${p(params.from)}`)
  if (params.to) conds.push(`created_at <= ${p(params.to)}`)

  return { where: conds.length ? `WHERE ${conds.join(" AND ")}` : "", values }
}

export async function list(params: ListParams): Promise<{ items: SubmissionRow[]; total: number }> {
  const { where, values } = buildWhere(params)

  const totalRes = await query<{ n: string }>(
    `SELECT count(*)::text AS n FROM public.feedback_submission ${where}`,
    values,
  )
  const total = Number(totalRes.rows[0]?.n ?? "0")

  const itemsRes = await query<SubmissionRow>(
    `SELECT ${SUBMISSION_COLUMNS}
       FROM public.feedback_submission
       ${where}
      ORDER BY created_at DESC
      LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
    [...values, params.limit, params.offset],
  )
  return { items: itemsRes.rows, total }
}

export async function getByReference(referenceCode: string): Promise<SubmissionRow | null> {
  const res = await query<SubmissionRow>(
    `SELECT ${SUBMISSION_COLUMNS} FROM public.feedback_submission WHERE reference_code = $1`,
    [referenceCode],
  )
  return res.rows[0] ?? null
}

export async function listReplies(referenceCode: string): Promise<ReplyRow[]> {
  const res = await query<ReplyRow>(
    `SELECT r.body, r.staff_name, r.sent_at
       FROM public.feedback_reply r
       JOIN public.feedback_submission s ON s.id = r.submission_id
      WHERE s.reference_code = $1
      ORDER BY r.sent_at ASC`,
    [referenceCode],
  )
  return res.rows
}

export async function listNotes(referenceCode: string): Promise<NoteRow[]> {
  const res = await query<NoteRow>(
    `SELECT n.body, n.staff_name, n.created_at
       FROM public.feedback_note n
       JOIN public.feedback_submission s ON s.id = n.submission_id
      WHERE s.reference_code = $1
      ORDER BY n.created_at ASC`,
    [referenceCode],
  )
  return res.rows
}

/** Set the triage status. Returns false when no such submission (→ 404). `replied` is never set here. */
export async function updateStatus(referenceCode: string, status: FeedbackStatus): Promise<boolean> {
  const res = await query<{ id: string }>(
    `UPDATE public.feedback_submission
        SET status = $2, updated_at = now()
      WHERE reference_code = $1
      RETURNING id`,
    [referenceCode, status],
  )
  return res.rows.length > 0
}

export async function insertNote(
  referenceCode: string,
  body: string,
  actor: StaffActor,
): Promise<boolean> {
  const res = await query<{ id: string }>(
    `INSERT INTO public.feedback_note (submission_id, body, staff_sub, staff_name)
     SELECT id, $2, $3, $4 FROM public.feedback_submission WHERE reference_code = $1
     RETURNING id`,
    [referenceCode, body, actor.sub, actor.name],
  )
  return res.rows.length > 0
}

/**
 * Write a reply AND flip the submission to `replied`, in ONE transaction (FR-029). Called ONLY after a
 * successful email send (the service guarantees that ordering) — a send failure never reaches here.
 */
export async function insertReplyAndMarkReplied(
  referenceCode: string,
  body: string,
  actor: StaffActor,
): Promise<boolean> {
  return withTransaction(async (client) => {
    const found = await client.query<{ id: string }>(
      `SELECT id FROM public.feedback_submission WHERE reference_code = $1 FOR UPDATE`,
      [referenceCode],
    )
    const id = found.rows[0]?.id
    if (!id) return false

    await client.query(
      `INSERT INTO public.feedback_reply (submission_id, body, staff_sub, staff_name)
       VALUES ($1, $2, $3, $4)`,
      [id, body, actor.sub, actor.name],
    )
    await client.query(
      `UPDATE public.feedback_submission SET status = 'replied', updated_at = now() WHERE id = $1`,
      [id],
    )
    return true
  })
}
