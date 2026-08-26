import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql"
import { Pool } from "pg"
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

/**
 * ⚠ Real PostgreSQL 16 — the load-bearing behaviour of this repo lives in the DATABASE, not the code:
 *
 *   • The rate limit is a `SELECT count(*) … WHERE (…) < $max` INSIDE the INSERT. "Did the cap
 *     refuse?" is answered by whether Postgres returned a row; a mock returns whatever it is told.
 *   • ⚠ The RACE is the whole point. A check-then-write passes a serial test and fails under two
 *     concurrent taps — which is exactly what 039 recorded after the newsletter shipped one. Only a
 *     real engine can run the two statements genuinely at once.
 *   • The ownership JOIN is what makes another customer's order unenqueueable.
 *
 * Gated behind CONTAINER_TESTS=1 so ordinary unit runs stay Docker-free (the feedback precedent).
 */
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

    await pool.query(`CREATE EXTENSION IF NOT EXISTS citext`)
    await pool.query(`
      CREATE TABLE public.customer (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        cognito_sub text NOT NULL UNIQUE,
        email citext NOT NULL
      )`)
    await pool.query(`
      CREATE TABLE public."order" (
        id uuid PRIMARY KEY,
        customer_id uuid NOT NULL REFERENCES public.customer (id),
        status text NOT NULL
      )`)
    await pool.query(`
      CREATE TABLE public.receipt_dispatch (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        order_id uuid NOT NULL REFERENCES public."order" (id) ON DELETE CASCADE,
        reason text NOT NULL CHECK (reason IN ('order_paid','customer_request')),
        recipient citext NOT NULL,
        status text NOT NULL DEFAULT 'pending',
        attempts int NOT NULL DEFAULT 0,
        created_at timestamptz NOT NULL DEFAULT now()
      )`)
    await pool.query(`
      CREATE UNIQUE INDEX receipt_dispatch_auto_uq
        ON public.receipt_dispatch (order_id) WHERE reason = 'order_paid'`)
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
    await pool.query(`INSERT INTO public."order" (id, customer_id, status) VALUES ($1, $2, 'paid')`, [
      ORDER,
      owner.rows[0].id,
    ])
    await pool.query(`INSERT INTO public."order" (id, customer_id, status) VALUES ($1, $2, 'paid')`, [
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

  /**
   * ⚠ THE TEST THAT ONLY A REAL ENGINE CAN RUN, and the reason this file exists.
   *
   * Two resends fired AT ONCE at the boundary. A check-then-write lets both pass — each sees a count
   * below the cap — and the shopper gets two emails from one cap of one. The conditional INSERT
   * decides atomically, so exactly one lands. Reverting `repo.ts` to a separate COUNT then INSERT
   * makes this test, and only this test, fail.
   */
  it("⚠ two CONCURRENT requests at the boundary enqueue exactly one", async () => {
    const results = await Promise.all([call(ORDER, SUB, 1), call(ORDER, SUB, 1)])

    const queued = results.filter((r) => r.status === "queued")
    const limited = results.filter((r) => r.status === "rate_limited")
    expect(queued).toHaveLength(1)
    expect(limited).toHaveLength(1)

    const rows = await pool.query(`SELECT count(*)::int AS n FROM public.receipt_dispatch`)
    expect(rows.rows[0].n).toBe(1)
  })

  /**
   * ⚠ SC-008. Another customer's order and a non-existent one BOTH answer `not_found`, from the same
   * branch — so no caller can tell them apart, and the route cannot be used to discover which order
   * ids are real.
   */
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

  /**
   * ⚠ The automatic send and a resend must coexist. `receipt_dispatch_auto_uq` constrains only the
   * `order_paid` arm — an unconditional UNIQUE(order_id) would have made this feature unbuildable,
   * which is exactly why `notification_request` could not carry it (research R2).
   */
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
