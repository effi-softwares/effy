import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql"
import { Pool } from "pg"
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"

/**
 * ⚠ The shared `query` helper forces SSL with the embedded RDS CA bundle, so pointing it at a local
 * container via DB_* env vars cannot work. The transport is replaced here; the SQL is NOT — the
 * statement under test is the real one from `./repo`, executed against real PostgreSQL.
 *
 * `vi.mock` is hoisted above the imports, so the pool is reached through a holder that `beforeAll`
 * fills in. Assigning it directly would run too late.
 */
const holder = vi.hoisted(() => ({ pool: null as Pool | null }))

vi.mock("@effy/edge-shared", () => ({
  query: (text: string, params?: unknown[]) => holder.pool!.query(text, params as never[]),
  withTransaction: async (fn: (c: unknown) => unknown) => fn(holder.pool),
}))

import { findBlockingOrders, IN_TRANSIT_BLOCK_DAYS } from "./repo"

/**
 * ⚠ THE LOAD-BEARING TEST OF THIS FEATURE, AGAINST REAL POSTGRESQL 16.
 *
 * The blocking predicate has been WRONG TWICE, and both times a mock would have agreed with the
 * code rather than with the world:
 *
 *   Attempt 1 — "block until the order reaches a terminal state". An order's only terminal state is
 *   every `shop_fulfillment` reaching `collected`, and feature 020 shipped that transition behind a
 *   DEV-ONLY STUB WITH NO ROUTE IN ANY ENVIRONMENT. So in production nothing ever became terminal,
 *   and every customer who had ever paid would have been PERMANENTLY UNDELETABLE.
 *
 *   Attempt 2 — "bound it at 30 days, matching the grace period". Effy is a WEEKLY-RE-BUY grocery
 *   platform, so a customer shopping every week is always within 30 days of an order. Same dead end,
 *   different disguise, and it would have hit the platform's most engaged customers hardest.
 *
 * Both are the shape Apple's "apps that make it unnecessarily difficult for a user to delete their
 * account will not pass review" is written to catch. Raw SQL with no ORM means a mock cannot catch a
 * wrong column, a wrong interval, or a join that quietly excludes the row that should have blocked —
 * so this runs the ACTUAL statement.
 *
 * Gated behind `-short`-equivalent: skipped unless Docker is reachable, so ordinary unit runs stay
 * Docker-free. Mirrors the Go side's `testing.Short()` convention.
 */

const RUN = process.env.CONTAINER_TESTS === "1"

describe.skipIf(!RUN)("findBlockingOrders — against real PostgreSQL", () => {
  let container: StartedPostgreSqlContainer
  let pool: Pool

  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:16-alpine").start()
    pool = new Pool({ connectionString: container.getConnectionUri() })
    holder.pool = pool

    // The columns the predicate actually reads. Deliberately minimal: if a future migration renames
    // one, this fails loudly instead of silently matching nothing.
    await pool.query(`
      CREATE TABLE public.customer (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid()
      );
      CREATE TABLE public."order" (
        id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        customer_id  uuid NOT NULL REFERENCES public.customer (id),
        order_number text NOT NULL,
        status       text NOT NULL,
        created_at   timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE public.shop_fulfillment (
        id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        order_id uuid NOT NULL REFERENCES public."order" (id) ON DELETE CASCADE,
        status   text NOT NULL
      );
    `)

  }, 120_000)

  afterAll(async () => {
    await pool?.end()
    await container?.stop()
  })

  async function seedCustomer(): Promise<string> {
    const r = await pool.query<{ id: string }>(
      `INSERT INTO public.customer DEFAULT VALUES RETURNING id`,
    )
    return r.rows[0]!.id
  }

  async function seedOrder(
    customerId: string,
    status: string,
    daysAgo: number,
    fulfillmentStatus: string | null = "picking",
  ): Promise<string> {
    const o = await pool.query<{ id: string }>(
      `INSERT INTO public."order" (customer_id, order_number, status, created_at)
       VALUES ($1, 'EFY-TEST', $2, now() - ($3 || ' days')::interval)
       RETURNING id`,
      [customerId, status, String(daysAgo)],
    )
    const id = o.rows[0]!.id
    if (fulfillmentStatus) {
      await pool.query(
        `INSERT INTO public.shop_fulfillment (order_id, status) VALUES ($1, $2)`,
        [id, fulfillmentStatus],
      )
    }
    return id
  }

  const blockersFor = (customerId: string) => findBlockingOrders(customerId)

  it("blocks an order awaiting payment", async () => {
    const c = await seedCustomer()
    await seedOrder(c, "pending_payment", 0, null)

    const rows = await blockersFor(c)
    expect(rows).toHaveLength(1)
    expect(rows[0]!.status).toBe("pending_payment")
    // ⚠ FR-042 forbids a block that cannot state its end.
    expect(rows[0]!.clears_at).toBeInstanceOf(Date)
  })

  it("blocks a recent paid order whose fulfilment has not completed", async () => {
    const c = await seedCustomer()
    await seedOrder(c, "paid", 1, "picking")

    const rows = await blockersFor(c)
    expect(rows).toHaveLength(1)
    expect(rows[0]!.status).toBe("paid")
  })

  /**
   * ⚠ ATTEMPT 1's DEFECT. Revert the age bound and this fails: with `collected` unreachable in
   * production, a paid order would block forever.
   */
  it("STOPS blocking once a paid order ages past the bound", async () => {
    const c = await seedCustomer()
    await seedOrder(c, "paid", IN_TRANSIT_BLOCK_DAYS + 1, "picking")

    expect(await blockersFor(c)).toHaveLength(0)
  })

  /**
   * ⚠ ATTEMPT 2's DEFECT, AND THE ONE MOST LIKELY TO COME BACK.
   *
   * A shopper who buys every week must still have days on which they can delete. If the bound is
   * ever widened to the 30-day grace period, this fails — which is the whole point of it existing.
   */
  it("leaves a WEEKLY shopper able to delete", async () => {
    const c = await seedCustomer()
    for (const daysAgo of [8, 15, 22, 29]) {
      await seedOrder(c, "paid", daysAgo, "picking")
    }

    expect(
      await blockersFor(c),
      "a weekly shopper whose last order is 8 days old must not be blocked",
    ).toHaveLength(0)
  })

  /**
   * ⚠ ATTEMPT 3's DEFECT — and the reason this test is now TWO tests.
   *
   * Until 053 the predicate read `f.status <> 'collected'`, written before the delivery lifecycle
   * existed with a comment promising it would "become correct automatically when the delivery
   * lifecycle lands". It landed in 049 with `delivered` as the terminal state — a DIFFERENT value —
   * and the predicate inverted itself in both directions without anything failing:
   *
   *   • a DELIVERED package satisfied `<> 'collected'`, so an ARRIVED order kept blocking;
   *   • a COLLECTED package did not, so an order genuinely IN TRANSIT did not block at all.
   *
   * ⚠ And this test asserted the second half of that defect. It seeded `collected` and demanded zero
   * blockers, which is 029's failure mode exactly: the test agreed with the code instead of with the
   * world. A test covering only one direction would leave the other live, so both are pinned.
   */
  it("does not block once every package has ARRIVED, even inside the window", async () => {
    const c = await seedCustomer()
    await seedOrder(c, "paid", 1, "delivered")

    expect(
      await blockersFor(c),
      "an order that has arrived must release the customer immediately, not after the 7-day backstop",
    ).toHaveLength(0)
  })

  it("DOES block on a package that is collected but not yet delivered", async () => {
    const c = await seedCustomer()
    await seedOrder(c, "paid", 1, "collected")

    expect(
      await blockersFor(c),
      "a collected package is with a driver or a carrier — genuinely in transit — so it must block",
    ).toHaveLength(1)
  })

  it("never blocks on a failed or cancelled order", async () => {
    const c = await seedCustomer()
    await seedOrder(c, "failed", 0)
    await seedOrder(c, "canceled", 0)

    expect(await blockersFor(c)).toHaveLength(0)
  })

  /** Scoping: one customer's order must never block another's deletion. */
  it("only ever sees the customer's OWN orders", async () => {
    const mine = await seedCustomer()
    const theirs = await seedCustomer()
    await seedOrder(theirs, "paid", 0, "picking")

    expect(await blockersFor(mine)).toHaveLength(0)
  })

  it("returns the human-facing order_number, which is the column that actually exists", async () => {
    const c = await seedCustomer()
    await seedOrder(c, "pending_payment", 0, null)

    const rows = await blockersFor(c)
    // ⚠ `public."order"` calls this `order_number`, NOT `reference`. The first draft of the repo used
    // `reference` and would have failed at runtime with a 500 on every deletion attempt.
    expect(rows[0]!.order_number).toBe("EFY-TEST")
  })
})
