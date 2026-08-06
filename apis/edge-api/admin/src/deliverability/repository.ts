// Repository for email deliverability: raw parameterised SQL, explicit row → domain mapping
// (constitution Principle VI, no ORM). Reads/writes public.email_delivery_{status,event} and the
// back-office audit log. The repair writes its audit row inside the SAME transaction as the change
// it records, following the shops slice's rule.
import type { PoolClient } from "pg"

import { query, withTransaction } from "@effy/edge-shared"

import {
  type DeliveryEvent,
  type DeliveryEventDTO,
  type DeliveryEventType,
  type DeliveryListItemDTO,
  type DeliveryListParams,
  type DeliveryStatusRow,
  type DeliverySubject,
  type EmailDeliveryState,
} from "./types"

// ── Row shapes (internal; never exported) ────────────────────────────────────────────────────

interface StatusRow {
  address: string
  raw_address: string
  state: EmailDeliveryState
  reason: string | null
  diagnostic: string | null
  last_event_at: Date
  last_message_id: string | null
  bounce_count: number
  complaint_count: number
  repaired_at: Date | null
  repaired_by: string | null
}

/**
 * One list, referenced by every statement, so a column added to the row type cannot be silently
 * half-added to only some of the queries (the convention from customer/src/customer/model.ts).
 */
const STATUS_COLUMNS = `
  address, raw_address, state, reason, diagnostic, last_event_at, last_message_id,
  bounce_count, complaint_count, repaired_at, repaired_by
`

function toStatus(r: StatusRow): DeliveryStatusRow {
  return {
    address: r.address,
    rawAddress: r.raw_address,
    state: r.state,
    reason: r.reason,
    diagnostic: r.diagnostic,
    lastEventAt: r.last_event_at.toISOString(),
    lastMessageId: r.last_message_id,
    bounceCount: r.bounce_count,
    complaintCount: r.complaint_count,
    repairedAt: r.repaired_at ? r.repaired_at.toISOString() : null,
    repairedBy: r.repaired_by,
  }
}

// ── Ingest ───────────────────────────────────────────────────────────────────────────────────

/**
 * Record one outcome. Returns `true` when it was NEW.
 *
 * ⚠ THE RETURN VALUE IS THE IDEMPOTENCY MECHANISM (FR-028). Outcome publication is at-least-once,
 * unordered, and may duplicate. `ON CONFLICT DO NOTHING` makes the insert safe, and the caller
 * advances the status row ONLY when this returns true — otherwise a redelivered bounce increments
 * bounce_count twice and inflates the number an operator is reading to make a decision.
 */
export async function insertEvent(e: DeliveryEvent): Promise<boolean> {
  const res = await query<{ id: string }>(
    `INSERT INTO public.email_delivery_event
       (address, raw_address, event_type, sub_type, reason, message_id, occurred_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (message_id, event_type, address) DO NOTHING
     RETURNING id`,
    [e.address, e.rawAddress, e.eventType, e.subType, e.reason, e.messageId, e.occurredAt],
  )
  return res.rowCount === 1
}

/**
 * Advance the conclusion for one address.
 *
 * ⚠ OUT-OF-ORDER SAFE. The `WHERE` on the DO UPDATE refuses to move the state backwards in time: a
 * Delivery for an OLDER message that arrives after a Bounce must not resurrect an address that has
 * since permanently failed. Counters still increment — they are history, and history is not ordered.
 *
 * ⚠ `repaired_at` is CLEARED whenever a failure lands, so a stale "repaired" stamp can never sit
 * beside a broken address.
 */
export async function upsertStatus(e: DeliveryEvent, state: EmailDeliveryState): Promise<void> {
  const isBounce = e.eventType === "bounce"
  const isComplaint = e.eventType === "complaint"
  const isFailure = state !== "reachable"

  await query(
    `INSERT INTO public.email_delivery_status
       (address, raw_address, state, reason, diagnostic, last_event_at, last_message_id,
        bounce_count, complaint_count)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT (address) DO UPDATE SET
       raw_address     = EXCLUDED.raw_address,
       bounce_count    = public.email_delivery_status.bounce_count    + EXCLUDED.bounce_count,
       complaint_count = public.email_delivery_status.complaint_count + EXCLUDED.complaint_count,
       state           = CASE WHEN EXCLUDED.last_event_at >= public.email_delivery_status.last_event_at
                              THEN EXCLUDED.state ELSE public.email_delivery_status.state END,
       reason          = CASE WHEN EXCLUDED.last_event_at >= public.email_delivery_status.last_event_at
                              THEN EXCLUDED.reason ELSE public.email_delivery_status.reason END,
       diagnostic      = CASE WHEN EXCLUDED.last_event_at >= public.email_delivery_status.last_event_at
                              THEN EXCLUDED.diagnostic ELSE public.email_delivery_status.diagnostic END,
       last_message_id = CASE WHEN EXCLUDED.last_event_at >= public.email_delivery_status.last_event_at
                              THEN EXCLUDED.last_message_id ELSE public.email_delivery_status.last_message_id END,
       last_event_at   = GREATEST(public.email_delivery_status.last_event_at, EXCLUDED.last_event_at),
       repaired_at     = CASE WHEN $10 THEN NULL ELSE public.email_delivery_status.repaired_at END,
       repaired_by     = CASE WHEN $10 THEN NULL ELSE public.email_delivery_status.repaired_by END,
       updated_at      = now()`,
    [
      e.address,
      e.rawAddress,
      state,
      e.reason,
      e.diagnostic,
      e.occurredAt,
      e.messageId,
      isBounce ? 1 : 0,
      isComplaint ? 1 : 0,
      isFailure,
    ],
  )
}

// ── Reads ────────────────────────────────────────────────────────────────────────────────────

export async function getStatus(address: string): Promise<DeliveryStatusRow | null> {
  const res = await query<StatusRow>(
    `SELECT ${STATUS_COLUMNS} FROM public.email_delivery_status WHERE address = $1`,
    [address],
  )
  const row = res.rows[0]
  return row ? toStatus(row) : null
}

export async function listStatuses(
  params: DeliveryListParams,
): Promise<{ items: DeliveryStatusRow[]; total: number }> {
  // "problems" is the default view: a list of every address ever delivered to answers no question
  // anyone has.
  const stateClause =
    params.state === "all"
      ? "TRUE"
      : params.state === "problems"
        ? "state <> 'reachable'"
        : "state = $1"

  const args: unknown[] = params.state === "all" || params.state === "problems" ? [] : [params.state]

  let where = stateClause
  if (params.q) {
    args.push(`%${params.q}%`)
    where += ` AND address ILIKE $${args.length}`
  }

  args.push(params.limit, params.offset)

  const res = await query<StatusRow & { total: string }>(
    `SELECT ${STATUS_COLUMNS}, count(*) OVER() AS total
       FROM public.email_delivery_status
      WHERE ${where}
      ORDER BY last_event_at DESC
      LIMIT $${args.length - 1} OFFSET $${args.length}`,
    args,
  )

  return {
    items: res.rows.map(toStatus),
    total: res.rows[0] ? Number(res.rows[0].total) : 0,
  }
}

export async function listEvents(address: string, limit = 50): Promise<DeliveryEventDTO[]> {
  const res = await query<{
    event_type: DeliveryEventType
    sub_type: string | null
    message_id: string
    occurred_at: Date
  }>(
    `SELECT event_type, sub_type, message_id, occurred_at
       FROM public.email_delivery_event
      WHERE address = $1
      ORDER BY occurred_at DESC
      LIMIT $2`,
    [address, limit],
  )

  return res.rows.map((r) => ({
    eventType: r.event_type,
    subType: r.sub_type,
    messageId: r.message_id,
    occurredAt: r.occurred_at.toISOString(),
  }))
}

/**
 * Who, if anyone, owns this address on the platform.
 *
 * ⚠ RETURNS null LEGITIMATELY. An address can fail before its account exists, after it is deleted,
 * or for the DRIVER audience — which has a Cognito pool and no platform table at all. The console
 * renders "—"; it must not invent an owner.
 *
 * ⚠ THE STAFF JOINS ARE WEAK, and that is stated rather than hidden. `public.customer.email` is
 * citext and uniquely indexed, so that join is exact and cheap. `public.shop_staff.email` is
 * nullable text with no index and `admin.staff.email` is text with no index, so those are sequential
 * scans over tables holding tens of rows. Fine now; not fine at scale. No index is added here —
 * that would be scope creep into two tables this feature does not otherwise touch, and an honest
 * note is more useful than a speculative index.
 */
export async function findSubject(address: string): Promise<DeliverySubject | null> {
  const res = await query<{ kind: string; id: string; name: string | null }>(
    `SELECT 'customer' AS kind, c.id::text AS id,
            nullif(trim(coalesce(c.given_name, '') || ' ' || coalesce(c.family_name, '')), '') AS name
       FROM public.customer c
      WHERE c.email = $1
      UNION ALL
     SELECT 'shop_staff', ss.id::text, ss.name
       FROM public.shop_staff ss
      WHERE lower(ss.email) = lower($1::text)
      UNION ALL
     SELECT 'admin_staff', a.id::text, a.name
       FROM admin.staff a
      WHERE lower(a.email) = lower($1::text)
      LIMIT 1`,
    [address],
  )

  const row = res.rows[0]
  return row ? { kind: row.kind as DeliverySubject["kind"], id: row.id, name: row.name } : null
}

// ── Repair ───────────────────────────────────────────────────────────────────────────────────

/**
 * Clear the platform's half of a repair, and record it.
 *
 * ⚠ THIS IS ONLY HALF THE REPAIR (FR-034). The caller MUST have already removed the mail service's
 * own suppression entry — using `raw_address`, case intact. Clearing only this half leaves the mail
 * service still accepting-and-dropping every send; clearing only the other half leaves the console
 * and the customer's account page still reporting the person as unreachable. Neither alone restores
 * anyone, which is why SC-013 requires this be demonstrated by doing one and watching it fail.
 *
 * The audit row is written inside the SAME transaction as the status change, per the shops slice.
 */
export async function markRepaired(
  address: string,
  previousState: EmailDeliveryState,
  actorSub: string,
  note: string,
): Promise<void> {
  await withTransaction(async (client: PoolClient) => {
    await client.query(
      `UPDATE public.email_delivery_status
          SET state       = 'reachable',
              reason      = NULL,
              diagnostic  = NULL,
              repaired_at = now(),
              repaired_by = $2,
              updated_at  = now()
        WHERE address = $1`,
      [address, actorSub],
    )

    await client.query(
      `INSERT INTO admin.audit_log (actor_sub, action, target_type, target_id, detail)
            VALUES ($1, $2, $3, NULL, $4::jsonb)`,
      [
        actorSub,
        "email_delivery.repair",
        "email_address",
        // ⚠ The address IS in the audit detail, deliberately: an audit row that does not say WHAT was
        // repaired cannot be audited. This is a privileged, access-controlled table — unlike logs,
        // which this feature never puts an address into.
        JSON.stringify({ address, previousState, note }),
      ],
    )
  })
}

/** Map a status row to the list DTO. Subject is resolved separately so the list can batch it. */
export function toListItemDTO(
  s: DeliveryStatusRow,
  subject: DeliverySubject | null,
): DeliveryListItemDTO {
  return {
    address: s.address,
    state: s.state,
    reason: s.reason,
    lastEventAt: s.lastEventAt,
    bounceCount: s.bounceCount,
    complaintCount: s.complaintCount,
    repairedAt: s.repairedAt,
    subject,
  }
}
