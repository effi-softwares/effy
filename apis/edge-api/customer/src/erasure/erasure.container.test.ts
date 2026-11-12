import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql"
import { transactorFor, type Transactor } from "@effy/edge-shared"
import { credit } from "@effy/edge-shared/points"
import { migrationSql } from "@effy/edge-shared/testing"
import { Pool } from "pg"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { digest } from "./fingerprint"
import { runErasure, type ErasureDeps } from "./job"
import { REFUND_MESSAGE_REMOVED } from "./repository"

/**
 * 113 SC-002: after erasure, nothing anywhere in the database names the customer - except a tax invoice Effy issued at
 * their request (FR-014) and the address of an order still on its way (until it finishes). The scan reads every text
 * column of every table, so a table added later with a customer column fails here until erasure handles it.
 */
const RUN = process.env.CONTAINER_TESTS === "1"

let container: StartedPostgreSqlContainer
let pool: Pool
let transact: Transactor
let seq = 0

const KEY = "test-fingerprint-key"
const one = async <T>(sql: string, args: unknown[] = []) => (await pool.query(sql, args)).rows[0] as T
const id = async (sql: string, args: unknown[] = []) => (await one<{ id: string }>(sql, args)).id

interface Marks {
  name: string
  email: string
  phone: string
  street: string
}

interface Seeded {
  customerId: string
  sub: string
  requestId: string
  marks: Marks
  paidOrderId: string
  inTransitOrderId: string
  inTransitFulfilmentId: string
  unpaidOrderId: string
  abandonedOrderId: string
  labelKey: string
}

async function shop(): Promise<string> {
  return id(`INSERT INTO public.shop (code, name) VALUES ($1, 'Shop') RETURNING id::text AS id`, [`S${++seq}${Date.now() % 1e5}`])
}

/** A customer with something personal in every place Effy keeps it, closed with a date in the past. */
async function seedCustomer(opts: { barred?: boolean; due?: boolean } = {}): Promise<Seeded> {
  const n = ++seq
  const marks: Marks = {
    name: `Zelda${n}Q`,
    email: `zelda${n}q@example.test`,
    phone: `+61 400 ${String(n).padStart(3, "0")} 777`,
    street: `${n} Quokka Lane`,
  }
  const sub = `erase-sub-${n}`
  const customerId = await id(
    `INSERT INTO public.customer (cognito_sub, email, given_name, family_name, phone, status, closure_state, stripe_customer_id)
     VALUES ($1, $2, $3, 'Marks', $4, $5, 'closing', $6) RETURNING id::text AS id`,
    [sub, marks.email, marks.name, marks.phone, opts.barred ? "barred" : "active", `cus_${n}`],
  )
  const requestId = await id(
    `INSERT INTO public.customer_closure_request (customer_id, erase_after, verification_method)
     VALUES ($1, now() ${opts.due === false ? "+" : "-"} interval '1 hour', 'email_code') RETURNING id::text AS id`,
    [customerId],
  )

  // Theirs alone.
  await pool.query(
    `INSERT INTO public.customer_address (customer_id, recipient_name, phone, line1, city, postal_code)
     VALUES ($1, $2, $3, $4, 'Carlton', '3053')`,
    [customerId, marks.name, marks.phone, marks.street],
  )
  await pool.query(`INSERT INTO public.cart (customer_id) VALUES ($1)`, [customerId])
  await pool.query(`INSERT INTO public.customer_list (customer_id, name) VALUES ($1, $2)`, [customerId, `${marks.name}'s list`]).catch(
    () => pool.query(`INSERT INTO public.customer_list (customer_id) VALUES ($1)`, [customerId]),
  )
  const feedback = await id(
    `INSERT INTO public.feedback_submission (reference_code, category, message, platform, customer_id, submitter_name, submitter_email)
     VALUES ($1, 'complaint', $2, 'web', $3, $4, $5) RETURNING id::text AS id`,
    [`FB-${n}`, `Please call ${marks.phone}`, customerId, marks.name, marks.email],
  )
  await pool.query(`INSERT INTO public.feedback_reply (submission_id, body, staff_sub) VALUES ($1, $2, 'staff-1')`, [
    feedback,
    `Hi ${marks.name}`,
  ])
  await pool.query(
    `INSERT INTO public.customer_marketing_consent (customer_id, category, granted, surface, via, wording_version)
     VALUES ($1, 'offers', true, 'web', 'settings', 'marketing-2026-11')`,
    [customerId],
  )
  await pool.query(
    `INSERT INTO public.customer_notification_choice (customer_id, category, channel, enabled, surface) VALUES ($1, 'orders', 'email', false, 'web')`,
    [customerId],
  )
  await transact((tx) =>
    credit(tx, {
      customerId, points: 1200, kind: "staff_credit", reason: "goodwill", author: { kind: "staff", sub: "staff-1" }, now: new Date(),
    }),
  )
  await pool.query(`INSERT INTO public.points_expiry_notice (customer_id, expiry_date, points) VALUES ($1, current_date + 30, 1200)`, [
    customerId,
  ])
  const promotionId = await id(
    `INSERT INTO public.promotion (name, kind, trigger, value_type, amount_off, applies_to, published_at, created_by)
     VALUES ($1, 'cart', 'automatic', 'amount', 5, 'cart', now() - interval '1 minute', 'staff-1') RETURNING id::text AS id`,
    [`P${n}`],
  )
  await pool.query(`INSERT INTO public.promotion_customer (promotion_id, customer_id) VALUES ($1, $2)`, [promotionId, customerId])
  await pool.query(
    `INSERT INTO public.device_token (subject_sub, audience, platform, fcm_token) VALUES ($1, 'customer', 'android', $2)`,
    [sub, `tok-${n}`],
  )
  await pool.query(
    `INSERT INTO public.notification (recipient_sub, audience, type, category, title, body, destination, dedupe_key)
     VALUES ($1, 'customer', 'order_paid', 'orders', 'Order placed', $2, '{"kind":"orders"}', $3)`,
    [sub, `Thanks ${marks.name}`, `d-${n}`],
  )
  await pool.query(`INSERT INTO public.newsletter_subscriber (email) VALUES ($1)`, [marks.email])
  await pool.query(
    `INSERT INTO public.email_delivery_status (address, raw_address, last_event_at) VALUES ($1, $2, now())`,
    [marks.email, marks.email],
  )
  await pool.query(
    `INSERT INTO public.email_delivery_event (address, raw_address, event_type, message_id, occurred_at) VALUES ($1, $2, 'bounce', $3, now())`,
    [marks.email, marks.email, `m-${n}`],
  )
  await pool.query(
    `INSERT INTO admin.audit_log (actor_sub, action, target_type, target_id, detail)
     VALUES ('staff-1', 'email_delivery.repair', 'email_address', NULL, $1::jsonb)`,
    [JSON.stringify({ address: marks.email, previousState: "undeliverable", note: `Spoke to ${marks.name}` })],
  )

  const address = JSON.stringify({
    recipientName: marks.name, phone: marks.phone, line1: marks.street, line2: null, city: "Carlton", region: "VIC",
    postalCode: "3053", country: "AU",
  })
  const order = (status: string, extra = "") =>
    id(
      `INSERT INTO public."order" (customer_id, order_number, status, item_subtotal_amount, grand_total_amount, delivery_address,
                                   billing_address, delivery_note, delivery_type, delivery_type_reason, placed_at)
       VALUES ($1, $2, $3, 40, 40, $4::jsonb, $4::jsonb, $5, 'effy', 'in_coverage', ${status === "paid" ? "now()" : "NULL"}) RETURNING id::text AS id${extra}`,
      [customerId, `EFY-${status.slice(0, 2).toUpperCase()}${n}${++seq}`, status, address, `Ring ${marks.name}`],
    )

  // A paid, finished order: refund request, business identity, receipt, tax invoice, courier label.
  const paidOrderId = await order("paid")
  const s = await shop()
  const fulfilment = await id(
    `INSERT INTO public.shop_fulfillment (order_id, shop_id, item_count, subtotal_amount, status) VALUES ($1, $2, 1, 40, 'delivered') RETURNING id::text AS id`,
    [paidOrderId, s],
  )
  const courierService = await id(
    `INSERT INTO public.courier_service (courier_name, service_name, estimate_text, max_business_days, pickup_weekdays, pickup_cutoff, updated_by)
     VALUES ('Carrier', $1, '2-3 days', 3, '{1,2,3,4,5}', '15:00', 'staff-1') RETURNING id::text AS id`,
    [`Svc ${n}`],
  )
  const labelKey = `courier-label/${paidOrderId}/label.pdf`
  await pool.query(
    `INSERT INTO public.courier_consignment (shop_fulfillment_id, courier_service_id, collection, state, created_by, label_key)
     VALUES ($1, $2, 'hub', 'delivered', 'staff-1', $3)`,
    [fulfilment, courierService, labelKey],
  )
  await pool.query(`INSERT INTO public.refund_request (order_id, customer_id, message) VALUES ($1, $2, $3)`, [
    paidOrderId,
    customerId,
    `It was for ${marks.name} at ${marks.street}`,
  ])
  await pool.query(`INSERT INTO public.order_business_identity (order_id, business_name, abn) VALUES ($1, $2, '12345678901')`, [
    paidOrderId,
    `${marks.name} Pty`,
  ])
  await pool.query(`INSERT INTO public.receipt_dispatch (order_id, reason, recipient) VALUES ($1, 'order_paid', $2)`, [
    paidOrderId,
    marks.email,
  ])
  await pool.query(
    `INSERT INTO public.tax_document (kind, order_id, number, snapshot, issuer) VALUES ('invoice', $1, $2, $3::jsonb, '{}'::jsonb)`,
    [paidOrderId, `INV-${n}`, JSON.stringify({ buyer: { name: `${marks.name} Pty`, email: marks.email } })],
  )

  // A paid order still on its way: keeps its address until it finishes.
  const inTransitOrderId = await order("paid")
  const inTransitFulfilmentId = await id(
    `INSERT INTO public.shop_fulfillment (order_id, shop_id, item_count, subtotal_amount, status) VALUES ($1, $2, 1, 40, 'ready_for_pickup') RETURNING id::text AS id`,
    [inTransitOrderId, s],
  )

  // An unpaid checkout holding a promotion use (RESTRICT): stripped, never deleted.
  const unpaidOrderId = await order("pending_payment")
  await pool.query(
    `INSERT INTO public.promotion_use (promotion_id, customer_id, order_id, goods_amount, status, hold_expires_at)
     VALUES ($1, $2, $3, 5, 'held', now() + interval '10 minutes')`,
    [promotionId, customerId, unpaidOrderId],
  )

  // An abandoned order with a late-payment refund (RESTRICT, and a money record).
  const abandonedOrderId = await order("abandoned")
  await pool.query(
    `INSERT INTO public.refund (order_id, kind, amount, reason, idempotency_key, actor_kind, status)
     VALUES ($1, 'unplaced', 40, 'order_abandoned', $2, 'system', 'succeeded')`,
    [abandonedOrderId, `unplaced:pi_${n}`],
  )

  return { customerId, sub, requestId, marks, paidOrderId, inTransitOrderId, inTransitFulfilmentId, unpaidOrderId, abandonedOrderId, labelKey }
}

/** Every text-like column of every table in public and admin that contains any mark, as `table.column`. */
async function placesNaming(marks: Marks): Promise<string[]> {
  const cols = (
    await pool.query<{ s: string; t: string; c: string }>(
      `SELECT c.table_schema AS s, c.table_name AS t, c.column_name AS c
         FROM information_schema.columns c
         JOIN information_schema.tables t ON t.table_schema = c.table_schema AND t.table_name = c.table_name
        WHERE c.table_schema IN ('public', 'admin') AND t.table_type = 'BASE TABLE'
          AND (c.data_type IN ('text', 'character varying', 'jsonb', 'json') OR c.udt_name = 'citext')`,
    )
  ).rows
  const needles = [marks.name, marks.email, marks.phone, marks.street].map((m) => `%${m.toLowerCase()}%`)
  const found: string[] = []
  for (const { s, t, c } of cols) {
    const hit = await pool.query(
      `SELECT 1 FROM "${s}"."${t}" WHERE lower("${c}"::text) LIKE ANY($1::text[]) LIMIT 1`,
      [needles],
    )
    if ((hit.rowCount ?? 0) > 0) found.push(`${t}.${c}`)
  }
  return found.sort()
}

function fakes(over: Partial<ErasureDeps> = {}) {
  const calls = { provider: [] as string[], signIn: [] as string[], labels: [] as string[] }
  const deps: ErasureDeps = {
    transact,
    deleteProviderCustomer: async (c) => void calls.provider.push(c),
    deleteSignIn: async (s) => void calls.signIn.push(s),
    deleteLabel: async (k) => void calls.labels.push(k),
    fingerprintKey: async () => KEY,
    ...over,
  }
  return { deps, calls }
}

describe.skipIf(!RUN)("113 - account erasure against real PostgreSQL", () => {
  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:16-alpine").start()
    pool = new Pool({ connectionString: container.getConnectionUri() })
    await pool.query(migrationSql())
    transact = transactorFor(pool)
  }, 300_000)

  afterAll(async () => {
    await pool?.end()
    await container?.stop()
  })

  it("leaves nothing that names the customer, apart from the issued invoice and an order still on its way", async () => {
    const c = await seedCustomer()
    expect((await placesNaming(c.marks)).length).toBeGreaterThan(10)

    const { deps, calls } = fakes()
    const out = await runErasure(deps)
    expect(out.counts).toMatchObject({ erased: 1, retried: 0, pointsForfeited: 1200 })
    expect(out.problems).toEqual([])
    expect(calls.provider).toEqual([expect.stringMatching(/^cus_/)])
    expect(calls.signIn).toEqual([c.sub])
    expect(calls.labels).toEqual([c.labelKey])

    expect(await placesNaming(c.marks)).toEqual(["order.billing_address", "order.delivery_address", "order.delivery_note", "tax_document.snapshot"])
    const transit = await one<{ delivery_address: Record<string, unknown> }>(`SELECT delivery_address FROM public."order" WHERE id = $1`, [
      c.inTransitOrderId,
    ])
    expect(transit.delivery_address).toHaveProperty("line1", c.marks.street)

    // The order finishes; the next run clears it.
    await pool.query(`UPDATE public.shop_fulfillment SET status = 'delivered' WHERE id = $1`, [c.inTransitFulfilmentId])
    const later = await runErasure(fakes().deps)
    expect(later.counts.ordersScrubbedLater).toBeGreaterThanOrEqual(1)
    expect(await placesNaming(c.marks)).toEqual(["tax_document.snapshot"])
  })

  it("115: removes the unsubscribe token and the record of which automatic messages reached them", async () => {
    const c = await seedCustomer()
    await pool.query(`UPDATE public.customer SET email_unsubscribe_token = $2 WHERE id = $1`, [c.customerId, "T".repeat(43)])
    const automationId = await id(
      `INSERT INTO public.message_automation (name, kind, audience, destination, title, body, mode, trigger_kind, trigger_value, created_by)
       VALUES ('Win back', 'offer', 'customer', '{"kind":"home"}'::jsonb, 'From Effy', 'We miss you at Effy', 'trigger', 'not_ordered_days', 30, 'staff-1')
       RETURNING id::text AS id`,
    )
    const runId = await id(
      `INSERT INTO public.message_automation_run (automation_id, outcome, matched) VALUES ($1, 'nobody', 0) RETURNING id::text AS id`,
      [automationId],
    )
    await pool.query(
      `INSERT INTO public.message_automation_recipient (automation_id, customer_id, occurrence_key, run_id) VALUES ($1, $2, 'none', $3)`,
      [automationId, c.customerId, runId],
    )

    await runErasure(fakes().deps)

    expect(await one(`SELECT email_unsubscribe_token FROM public.customer WHERE id = $1`, [c.customerId])).toEqual({ email_unsubscribe_token: null })
    expect((await pool.query(`SELECT 1 FROM public.message_automation_recipient WHERE customer_id = $1`, [c.customerId])).rowCount).toBe(0)
  })

  it("116: removes a queued badge correction for the account", async () => {
    const c = await seedCustomer()
    await pool.query(`INSERT INTO public.notification_badge_correction (recipient_sub, audience) VALUES ($1, 'customer')`, [c.sub])
    await runErasure(fakes().deps)
    expect((await pool.query(`SELECT 1 FROM public.notification_badge_correction WHERE recipient_sub = $1`, [c.sub])).rowCount).toBe(0)
  })

  it("keeps every order, stripped to suburb and postcode, and forfeits the points against the empty record", async () => {
    const c = await seedCustomer()
    await runErasure(fakes().deps)

    const orders = await pool.query<{ id: string; delivery_address: Record<string, unknown>; delivery_note: string | null }>(
      `SELECT id::text AS id, delivery_address, delivery_note FROM public."order" WHERE customer_id = $1`,
      [c.customerId],
    )
    expect(orders.rows.map((o) => o.id).sort()).toEqual(
      [c.paidOrderId, c.inTransitOrderId, c.unpaidOrderId, c.abandonedOrderId].sort(),
    )
    const paid = orders.rows.find((o) => o.id === c.paidOrderId)!
    expect(paid.delivery_address).toEqual({ city: "Carlton", region: "VIC", postalCode: "3053", country: "AU" })
    expect(paid.delivery_note).toBeNull()
    expect(await one(`SELECT message FROM public.refund_request WHERE order_id = $1`, [c.paidOrderId])).toEqual({
      message: REFUND_MESSAGE_REMOVED,
    })
    expect(await one(`SELECT count(*)::int AS n FROM public.refund WHERE order_id = $1`, [c.abandonedOrderId])).toEqual({ n: 1 })
    expect(await one(`SELECT label_key FROM public.courier_consignment cc JOIN public.shop_fulfillment f ON f.id = cc.shop_fulfillment_id WHERE f.order_id = $1`, [c.paidOrderId])).toEqual({ label_key: null })

    expect(
      await one(`SELECT points, kind FROM public.points_entry WHERE customer_id = $1 AND kind = 'forfeited'`, [c.customerId]),
    ).toEqual({ points: -1200, kind: "forfeited" })
    expect(await one(`SELECT public.points_usable($1, now()) AS u`, [c.customerId])).toEqual({ u: 0 })

    expect(
      await one(
        `SELECT email, given_name, family_name, phone, stripe_customer_id, closure_state, (erased_at IS NOT NULL) AS erased
           FROM public.customer WHERE id = $1`,
        [c.customerId],
      ),
    ).toEqual({ email: null, given_name: null, family_name: null, phone: null, stripe_customer_id: null, closure_state: "erased", erased: true })
    expect(await one(`SELECT (erased_at IS NOT NULL) AS erased FROM public.customer_closure_request WHERE id = $1`, [c.requestId])).toEqual({
      erased: true,
    })
  })

  it("frees the email for a new, empty account", async () => {
    const c = await seedCustomer()
    await runErasure(fakes().deps)
    const fresh = await id(`INSERT INTO public.customer (cognito_sub, email) VALUES ('new-sub-${c.sub}', $1) RETURNING id::text AS id`, [
      c.marks.email,
    ])
    expect(fresh).not.toBe(c.customerId)
    expect(await one(`SELECT count(*)::int AS n FROM public."order" WHERE customer_id = $1`, [fresh])).toEqual({ n: 0 })
  })

  it("never erases a closure that was restored, or one not yet due", async () => {
    const restored = await seedCustomer()
    await pool.query(
      `UPDATE public.customer_closure_request SET cancelled_at = now(), cancelled_reason = 'restored_by_customer' WHERE id = $1`,
      [restored.requestId],
    )
    await pool.query(`UPDATE public.customer SET closure_state = 'open' WHERE id = $1`, [restored.customerId])
    const notDue = await seedCustomer({ due: false })

    await runErasure(fakes().deps)

    for (const c of [restored, notDue]) {
      expect(await one(`SELECT email FROM public.customer WHERE id = $1`, [c.customerId])).toEqual({ email: c.marks.email })
    }
  })

  it("a failed sign-in removal leaves the account closing, and the next run finishes it", async () => {
    const c = await seedCustomer()
    class TooManyRequestsException extends Error {
      override name = "TooManyRequestsException"
    }
    const failing = fakes({
      deleteSignIn: async () => {
        throw new TooManyRequestsException("slow down")
      },
    })
    const first = await runErasure(failing.deps)
    expect(first.counts).toMatchObject({ erased: 0, retried: 1 })
    expect(first.problems).toEqual(["sign-in: TooManyRequestsException"])
    expect(await one(`SELECT closure_state FROM public.customer WHERE id = $1`, [c.customerId])).toEqual({ closure_state: "closing" })

    const second = await runErasure(fakes().deps)
    expect(second.counts.erased).toBe(1)
    // Twice changes nothing more.
    const third = await runErasure(fakes().deps)
    expect(third.counts.erased).toBe(0)
    expect(await one(`SELECT count(*)::int AS n FROM public.points_entry WHERE customer_id = $1 AND kind = 'forfeited'`, [c.customerId])).toEqual({ n: 1 })
  })

  it("keeps a fingerprint only for a barred account (email and phone)", async () => {
    const open = await seedCustomer()
    const barred = await seedCustomer({ barred: true })
    await runErasure(fakes().deps)

    const prints = await pool.query<{ kind: string; digest: Buffer }>(`SELECT kind, digest FROM public.erased_barred_fingerprint`)
    const has = (kind: "email" | "phone", value: string) =>
      prints.rows.some((p) => p.kind === kind && p.digest.equals(digest(kind, value, KEY)))
    expect(has("email", barred.marks.email)).toBe(true)
    expect(has("phone", barred.marks.phone)).toBe(true)
    expect(has("email", open.marks.email)).toBe(false)
  })
})
