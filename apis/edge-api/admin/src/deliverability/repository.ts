// The repair writes its audit row in the same transaction as the change.
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

/** One column list for every statement, so a column cannot be half-added. */
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

/** `true` when new. Outcomes arrive at least once, so the caller advances status only on true. */
export async function insertEvent(e: DeliveryEvent): Promise<boolean> {
  const res = await query<{ id: string }>(
    `INSERT INTO public.email_delivery_event
       (address, raw_address, event_type, sub_type, reason, message_id, template_id, occurred_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (message_id, event_type, address) DO NOTHING
     RETURNING id`,
    [e.address, e.rawAddress, e.eventType, e.subType, e.reason, e.messageId, e.templateId, e.occurredAt],
  )
  return res.rowCount === 1
}

/**
 * Out-of-order safe: the do update's where never moves the state back in time, though counters still
 * increment. `repaired_at` is cleared whenever a failure lands.
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
  // "problems" is the default view.
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
    template_id: string | null
    occurred_at: Date
  }>(
    `SELECT event_type, sub_type, message_id, template_id, occurred_at
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
    templateId: r.template_id,
    occurredAt: r.occurred_at.toISOString(),
  }))
}

/**
 * The address's owner, or null legitimately (before an account exists, after deletion, or a driver,
 * who has no platform table). The staff joins are unindexed scans over small tables.
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

/**
 * The platform's half of a repair, with its audit row in the same transaction. The caller must first
 * remove the SES suppression entry (by `raw_address`); either half alone restores nobody.
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
        // The address is in the audit detail on purpose: an access-controlled table, unlike logs.
        JSON.stringify({ address, previousState, note }),
      ],
    )
  })
}

/** The subject is resolved separately so the list can batch it. */
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
