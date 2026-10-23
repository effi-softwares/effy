import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql"
import { migrationSql } from "@effy/edge-shared/testing"
import { Pool } from "pg"
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

/** The rate limit inside the INSERT (under a real race) and the ownership join, against real Postgres. */
const holder = vi.hoisted(() => ({ pool: null as Pool | null }))

vi.mock("@effy/edge-shared", () => ({
  query: (text: string, params?: unknown[]) => holder.pool!.query(text, params as never[]),
  withTransaction: async (fn: (c: unknown) => unknown) => fn(holder.pool),
}))

import { enqueueResend } from "./repo"

const RUN = process.env.CONTAINER_TESTS === "1"

const ORDER = "11111111-1111-4111-8111-111111111111"
const OTHER_ORDER = "22222222-2222-4222-8222-222222222222"
const SUB = "sub-owner"
const OTHER_SUB = "sub-stranger"

describe.runIf(RUN)("enqueueResend against real PostgreSQL (052 US4)", () => {
  let container: StartedPostgreSqlContainer
  let pool: Pool

  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:16-alpine").start()
    pool = new Pool({ connectionString: container.getConnectionUri() })
    holder.pool = pool

    await pool.query(migrationSql())
  }, 120_000)

  afterAll(async () => {
    await pool?.end()
    await container?.stop()
  })

  beforeEach(async () => {
    await pool.query(`TRUNCATE public.receipt_dispatch, public."order", public.customer CASCADE`)
    const owner = await pool.query(
      `INSERT INTO public.customer (cognito_sub, email) VALUES ($1, $2) RETURNING id`,
      [SUB, "owner@example.com"],
    )
    const stranger = await pool.query(
      `INSERT INTO public.customer (cognito_sub, email) VALUES ($1, $2) RETURNING id`,
      [OTHER_SUB, "stranger@example.com"],
    )
    await pool.query(`INSERT INTO public."order" (id, customer_id, status, order_number, delivery_address, item_subtotal_amount, grand_total_amount, delivery_type, delivery_type_reason, courier_estimate)
       VALUES ($1, $2, 'paid', 'EFY-' || substr(md5(random()::text), 1, 8), '{}', 10, 10, 'courier', 'out_of_coverage', '2–4 business days')`, [
      ORDER,
      owner.rows[0].id,
    ])
    await pool.query(`INSERT INTO public."order" (id, customer_id, status, order_number, delivery_address, item_subtotal_amount, grand_total_amount, delivery_type, delivery_type_reason, courier_estimate)
       VALUES ($1, $2, 'paid', 'EFY-' || substr(md5(random()::text), 1, 8), '{}', 10, 10, 'courier', 'out_of_coverage', '2–4 business days')`, [
      OTHER_ORDER,
      stranger.rows[0].id,
    ])
  })

  const call = (orderId = ORDER, sub = SUB, max = 3) =>
    enqueueResend({ orderId, cognitoSub: sub, windowMinutes: 60, maxPerWindow: max })

  it("enqueues one dispatch to the ADDRESS ON THE ACCOUNT", async () => {
    expect(await call()).toEqual({ status: "queued" })

    const rows = await pool.query(`SELECT reason, recipient FROM public.receipt_dispatch`)
    expect(rows.rowCount).toBe(1)
    expect(rows.rows[0]).toMatchObject({
      reason: "customer_request",
      recipient: "owner@example.com",
    })
  })

  it("refuses once the cap is reached, and enqueues NOTHING when it does", async () => {
    expect(await call(ORDER, SUB, 2)).toEqual({ status: "queued" })
    expect(await call(ORDER, SUB, 2)).toEqual({ status: "queued" })
    expect(await call(ORDER, SUB, 2)).toEqual({ status: "rate_limited" })

    const rows = await pool.query(`SELECT count(*)::int AS n FROM public.receipt_dispatch`)
    expect(rows.rows[0].n).toBe(2)
  })

  /** Two resends at once at the boundary: exactly one lands. */
  it("⚠ two CONCURRENT requests at the boundary enqueue exactly one", async () => {
    const results = await Promise.all([call(ORDER, SUB, 1), call(ORDER, SUB, 1)])

    const queued = results.filter((r) => r.status === "queued")
    const limited = results.filter((r) => r.status === "rate_limited")
    expect(queued).toHaveLength(1)
    expect(limited).toHaveLength(1)

    const rows = await pool.query(`SELECT count(*)::int AS n FROM public.receipt_dispatch`)
    expect(rows.rows[0].n).toBe(1)
  })

  /** Another customer's order and a missing one both answer `not_found`, from one branch. */
  it("⚠ refuses another customer's order exactly as it refuses a missing one", async () => {
    expect(await call(OTHER_ORDER, SUB)).toEqual({ status: "not_found" })
    expect(await call("33333333-3333-4333-8333-333333333333", SUB)).toEqual({ status: "not_found" })

    const rows = await pool.query(`SELECT count(*)::int AS n FROM public.receipt_dispatch`)
    expect(rows.rows[0].n).toBe(0)
  })

  it("refuses an unpaid order without enqueuing", async () => {
    await pool.query(`UPDATE public."order" SET status='pending_payment' WHERE id=$1`, [ORDER])
    expect(await call()).toEqual({ status: "not_paid" })

    const rows = await pool.query(`SELECT count(*)::int AS n FROM public.receipt_dispatch`)
    expect(rows.rows[0].n).toBe(0)
  })

  /** The automatic send and a resend coexist: `receipt_dispatch_auto_uq` constrains only `order_paid`. */
  it("enqueues a resend alongside the order's automatic dispatch", async () => {
    await pool.query(
      `INSERT INTO public.receipt_dispatch (order_id, reason, recipient)
       VALUES ($1, 'order_paid', 'owner@example.com')`,
      [ORDER],
    )
    expect(await call()).toEqual({ status: "queued" })

    const rows = await pool.query(
      `SELECT reason, count(*)::int AS n FROM public.receipt_dispatch GROUP BY reason ORDER BY reason`,
    )
    expect(rows.rows).toEqual([
      { reason: "customer_request", n: 1 },
      { reason: "order_paid", n: 1 },
    ])
  })
})
