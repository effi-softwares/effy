// 113: erasing a customer whose deletion date has passed (FR-009 to FR-019). One account, one transaction: everything
// below happens, or nothing does and the account is still `closing` for the next run. Safe to run twice.
//
// ⚠ NO ORDER IS DELETED. promotion_use, order_promotion, points_entry, refund, round_stop and delivery_override all hold
// `order` with ON DELETE RESTRICT, and refunds are money records. Every order is stripped instead (FR-010a, FR-013),
// once it is finished; an order still on its way keeps its address until a later run (`scrubFinishedOrders`).
//
// Every table that holds a customer's personal data is named here; erasure.container.test.ts seeds each one and scans
// every text column in the database afterwards, so a new table with a customer column fails that test until it is here.
import { ERASED_CUSTOMER_WORD } from "@effy/shared-types"
import type { Queryable } from "@effy/edge-shared"
import { clearLabelsForErasure } from "@effy/edge-shared/delivery"
import { forfeit } from "@effy/edge-shared/points"

import type { Fingerprints } from "./fingerprint"

export interface DueClosure {
  requestId: string
  customerId: string
  sub: string
  email: string | null
  phone: string | null
  barred: boolean
  providerCustomerId: string | null
}

/** Due closures, oldest date first, each locked for this run (a concurrent run skips it). */
export async function claimDue(tx: Queryable, limit: number): Promise<DueClosure[]> {
  const r = await tx.query<{
    request_id: string
    customer_id: string
    sub: string
    email: string | null
    phone: string | null
    status: string
    stripe_customer_id: string | null
  }>(
    `SELECT r.id::text AS request_id, c.id::text AS customer_id, c.cognito_sub AS sub, c.email::text AS email, c.phone,
            c.status, c.stripe_customer_id
       FROM public.customer_closure_request r
       JOIN public.customer c ON c.id = r.customer_id
      WHERE r.cancelled_at IS NULL AND r.erased_at IS NULL AND r.erase_after <= now()
        AND c.closure_state = 'closing'
      ORDER BY r.erase_after
      LIMIT $1
      FOR UPDATE OF r SKIP LOCKED`,
    [limit],
  )
  return r.rows.map((x) => ({
    requestId: x.request_id,
    customerId: x.customer_id,
    sub: x.sub,
    email: x.email,
    phone: x.phone,
    barred: x.status === "barred",
    providerCustomerId: x.stripe_customer_id,
  }))
}

/** "Finished": every package delivered, unfulfillable or withdrawn - or never paid, so no package at all. */
const FINISHED = `NOT EXISTS (SELECT 1 FROM public.shop_fulfillment f
                               WHERE f.order_id = o.id AND f.status NOT IN ('delivered', 'unfulfillable', 'withdrawn'))`

const KEEP_ADDRESS_KEYS = `ARRAY['city', 'region', 'postalCode', 'country']`
const STRIP_ADDRESS = (col: string) =>
  `CASE WHEN ${col} IS NULL THEN NULL
        ELSE (SELECT COALESCE(jsonb_object_agg(k, v), '{}'::jsonb) FROM jsonb_each(${col}) AS e(k, v) WHERE k = ANY(${KEEP_ADDRESS_KEYS})) END`

export const REFUND_MESSAGE_REMOVED = "Removed when the customer deleted their account."

/**
 * The scrub of an erased customer's orders that are finished and not yet scrubbed (`delivery_note` or a street key
 * still there). Returns the courier label keys cleared, for the caller to delete from the bucket after the commit.
 */
async function scrubOrders(
  tx: Queryable,
  where: string,
  args: unknown[],
  limit = 1000,
): Promise<{ orders: number; labelKeys: string[] }> {
  const ids = (
    await tx.query<{ id: string }>(
      `SELECT o.id::text AS id FROM public."order" o
        WHERE ${where} AND ${FINISHED}
          AND (o.delivery_note IS NOT NULL OR o.delivery_handover IS NOT NULL
               OR EXISTS (SELECT 1 FROM jsonb_object_keys(o.delivery_address) k WHERE k <> ALL(${KEEP_ADDRESS_KEYS}))
               OR EXISTS (SELECT 1 FROM jsonb_object_keys(COALESCE(o.billing_address, '{}'::jsonb)) k WHERE k <> ALL(${KEEP_ADDRESS_KEYS}))
               OR EXISTS (SELECT 1 FROM public.shop_fulfillment f JOIN public.courier_consignment cc ON cc.shop_fulfillment_id = f.id
                           WHERE f.order_id = o.id AND cc.label_key IS NOT NULL)
               OR EXISTS (SELECT 1 FROM public.round_stop s JOIN public.delivery_proof p ON p.stop_id = s.id
                           WHERE s.order_id = o.id AND p.note IS NOT NULL)
               OR EXISTS (SELECT 1 FROM public.refund_request rr WHERE rr.order_id = o.id AND rr.message <> $${args.length + 1}))
        LIMIT $${args.length + 2}
        FOR UPDATE OF o`,
      [...args, REFUND_MESSAGE_REMOVED, limit],
    )
  ).rows.map((r) => r.id)
  if (ids.length === 0) return { orders: 0, labelKeys: [] }

  await tx.query(
    `UPDATE public."order" o
        SET delivery_address = ${STRIP_ADDRESS("o.delivery_address")},
            billing_address  = ${STRIP_ADDRESS("o.billing_address")},
            delivery_note = NULL, delivery_handover = NULL, updated_at = now()
      WHERE o.id = ANY($1::uuid[])`,
    [ids],
  )
  await tx.query(`UPDATE public.refund_request SET message = $2 WHERE order_id = ANY($1::uuid[])`, [ids, REFUND_MESSAGE_REMOVED])
  await tx.query(
    `UPDATE public.delivery_proof p SET note = NULL
       FROM public.round_stop s WHERE p.stop_id = s.id AND s.order_id = ANY($1::uuid[]) AND p.note IS NOT NULL`,
    [ids],
  )
  // Courier labels through their one writer (080's consignment.ts).
  const labelKeys = await clearLabelsForErasure(tx, ids)
  return { orders: ids.length, labelKeys }
}

export interface ErasureOutcome {
  pointsForfeited: number
  /** Courier label files to delete from the media bucket once this commits. */
  labelKeys: string[]
}

/** Erases one claimed customer, inside the caller's transaction. */
export async function eraseCustomer(
  tx: Queryable,
  c: DueClosure,
  now: Date,
  fingerprints: Fingerprints | null,
): Promise<ErasureOutcome> {
  // 1. The points go first, recorded against their owner like any forfeit (074 FR-024).
  const pointsForfeited = await forfeit(tx, c.customerId, now)

  // 2. What is theirs alone.
  const byCustomer = [
    `DELETE FROM public.customer_address WHERE customer_id = $1`,
    `DELETE FROM public.cart WHERE customer_id = $1`, // items, saved-for-later and change log cascade
    `DELETE FROM public.customer_saved_item WHERE customer_id = $1`,
    `DELETE FROM public.customer_list_entry WHERE customer_id = $1`,
    `DELETE FROM public.customer_list WHERE customer_id = $1`,
    `DELETE FROM public.customer_marketing_consent WHERE customer_id = $1`,
    `DELETE FROM public.customer_notification_choice WHERE customer_id = $1`,
    `DELETE FROM public.points_expiry_notice WHERE customer_id = $1`,
    `DELETE FROM public.promotion_customer WHERE customer_id = $1`,
    // 115: which automatic messages reached them (the account row is kept, so its cascade never fires).
    `DELETE FROM public.message_automation_recipient WHERE customer_id = $1`,
    `DELETE FROM public.order_business_identity WHERE order_id IN (SELECT id FROM public."order" WHERE customer_id = $1)`,
    `DELETE FROM public.receipt_dispatch WHERE order_id IN (SELECT id FROM public."order" WHERE customer_id = $1)`,
  ]
  for (const sql of byCustomer) await tx.query(sql, [c.customerId])

  // Feedback they sent, signed in or not (notes and replies cascade).
  await tx.query(`DELETE FROM public.feedback_submission WHERE customer_id = $1 OR ($2::citext IS NOT NULL AND submitter_email = $2::citext)`, [
    c.customerId,
    c.email,
  ])

  // By the sign-in id: devices and notifications (109's purge stays as the backstop; deliveries cascade).
  await tx.query(`DELETE FROM public.device_token WHERE subject_sub = $1 AND audience = 'customer'`, [c.sub])
  await tx.query(`DELETE FROM public.notification WHERE recipient_sub = $1 AND audience = 'customer'`, [c.sub])
  // 116: a queued badge correction for the closed account (no personal detail, but its tokens are gone).
  await tx.query(`DELETE FROM public.notification_badge_correction WHERE recipient_sub = $1 AND audience = 'customer'`, [c.sub])

  // By the address: the newsletter and email delivery history, and the staff audit entries that name it.
  if (c.email) {
    await tx.query(`DELETE FROM public.newsletter_subscriber WHERE email = $1::citext`, [c.email])
    await tx.query(`DELETE FROM public.email_delivery_event WHERE address = $1::citext`, [c.email])
    await tx.query(`DELETE FROM public.email_delivery_status WHERE address = $1::citext`, [c.email])
    await tx.query(
      `UPDATE admin.audit_log
          SET detail = jsonb_build_object('address', $2::text, 'previousState', detail->'previousState')
        WHERE target_type = 'email_address' AND lower(detail->>'address') = lower($1)`,
      [c.email, ERASED_CUSTOMER_WORD],
    )
  }

  // 3. Their orders, once finished (an order still on its way keeps its address until a later run).
  const scrubbed = await scrubOrders(tx, `o.customer_id = $1`, [c.customerId])

  // 4. Security records for a barred account only (FR-016).
  if (c.barred && fingerprints) {
    for (const [kind, d] of [
      ["email", fingerprints.email],
      ["phone", fingerprints.phone],
    ] as const) {
      if (!d) continue
      await tx.query(
        `INSERT INTO public.erased_barred_fingerprint (kind, digest, erased_at) VALUES ($1, $2, $3::date)
         ON CONFLICT (kind, digest) DO UPDATE SET erased_at = EXCLUDED.erased_at`,
        [kind, d, now],
      )
    }
  }

  // 5. The row stays, emptied, so orders, points and refunds keep their owner.
  await tx.query(
    `UPDATE public.customer
        SET email = NULL, given_name = NULL, family_name = NULL, phone = NULL, stripe_customer_id = NULL,
            email_unsubscribe_token = NULL,
            has_password = false, password_updated_at = NULL,
            closure_state = 'erased', erased_at = $2, updated_at = now()
      WHERE id = $1`,
    [c.customerId, now],
  )

  // 6. The record that the deletion was carried out (FR-018).
  await tx.query(`UPDATE public.customer_closure_request SET erased_at = $2, updated_at = now() WHERE id = $1`, [c.requestId, now])

  return { pointsForfeited, labelKeys: scrubbed.labelKeys }
}

/** Erased customers' orders that were on their way at erasure and have since finished: the same scrub (FR-013). */
export async function scrubFinishedOrders(tx: Queryable, limit = 200): Promise<{ orders: number; labelKeys: string[] }> {
  return scrubOrders(
    tx,
    `EXISTS (SELECT 1 FROM public.customer c WHERE c.id = o.customer_id AND c.closure_state = 'erased')`,
    [],
    limit,
  )
}
