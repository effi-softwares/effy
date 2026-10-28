import { dayRangeCondition, likePattern, limitOffsetClause, orderBy, query, runOffsetPage, withTransaction } from "@effy/edge-shared"
import type { FeedbackStatus } from "@effy/shared-types"

import { FEEDBACK_LIST, FEEDBACK_VIEWS, VIEW_STATUSES, type FeedbackListRequest, type FeedbackView } from "./list"
import type { NoteRow, ReplyRow, StaffActor, SubmissionRow } from "./types"

/** Each filter appends a bound parameter, never interpolated. Search is ILIKE over message, email and reference (trigram index on message). */

const SUBMISSION_COLUMNS = `
  reference_code, category, status, rating, message, submitter_name, submitter_email,
  email_verified, customer_id, source, platform, created_at, updated_at
`

/** Search and every filter but the view, shared by the page and its view counts. */
function filterWhere(req: Pick<FeedbackListRequest, "q" | "filters">, values: unknown[]): string[] {
  const conds: string[] = []
  const p = (v: unknown) => `$${values.push(v)}`
  const f = req.filters
  if (req.q) {
    const term = likePattern(req.q)
    // Separate params so the planner can use the trigram index on message.
    conds.push(`(message ILIKE ${p(term)} OR submitter_email ILIKE ${p(term)} OR reference_code ILIKE ${p(term)})`)
  }
  if (f.category) conds.push(`category = ${p(f.category)}`)
  if (f.rating) conds.push(`rating = ${p(Number(f.rating))}`)
  const received = dayRangeCondition("created_at", { from: f.receivedFrom, to: f.receivedTo }, values)
  if (received) conds.push(received)
  return conds
}

function viewWhere(view: FeedbackView, values: unknown[]): string | null {
  const statuses = VIEW_STATUSES[view]
  if (!statuses) return null
  values.push(statuses)
  return `status = ANY($${values.length}::text[])`
}

/** One page with its exact total (103). */
export async function list(req: FeedbackListRequest) {
  return runOffsetPage(req, async (read) => {
    const values: unknown[] = []
    const conds = filterWhere(req, values)
    const v = viewWhere(req.filters.view ?? "open", values)
    if (v) conds.push(v)
    const paging = limitOffsetClause(read, values)
    const res = await query<SubmissionRow & { full_count: string }>(
      `SELECT ${SUBMISSION_COLUMNS}, count(*) OVER () AS full_count
         FROM public.feedback_submission
         ${conds.length ? `WHERE ${conds.join(" AND ")}` : ""}
         ${orderBy(FEEDBACK_LIST, req)}
         ${paging}`,
      values,
    )
    return res.rows
  })
}

/** Every view's count for the search and filters, in one statement (103 FR-017; it was one request per view). */
export async function viewCounts(req: Pick<FeedbackListRequest, "q" | "filters">): Promise<Record<FeedbackView, number>> {
  const values: unknown[] = []
  const conds = filterWhere(req, values)
  const col = (v: FeedbackView) => {
    const s = VIEW_STATUSES[v]
    return `count(*) ${s ? `FILTER (WHERE status IN (${s.map((x) => `'${x}'`).join(", ")}))` : ""}::int AS ${v}`
  }
  const res = await query<Record<FeedbackView, number>>(
    `SELECT ${FEEDBACK_VIEWS.map(col).join(", ")}
       FROM public.feedback_submission
       ${conds.length ? `WHERE ${conds.join(" AND ")}` : ""}`,
    values,
  )
  return res.rows[0]!
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

/** false when there is no such submission. Never sets `replied`. */
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

/** Writes the reply and sets `replied` in one transaction; only ever called after a successful send. */
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
