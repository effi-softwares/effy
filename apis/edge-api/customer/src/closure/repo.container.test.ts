import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql"
import { migrationSql } from "@effy/edge-shared/testing"
import { Pool } from "pg"
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"

/** Only the transport is replaced (the shared query forces RDS TLS); the statement is the real one. The pool is reached through a holder because `vi.mock` is hoisted. */
const holder = vi.hoisted(() => ({ pool: null as Pool | null }))

vi.mock("@effy/edge-shared", () => ({
  query: (text: string, params?: unknown[]) => holder.pool!.query(text, params as never[]),
  withTransaction: async (fn: (c: unknown) => unknown) => fn(holder.pool),
}))

import { findBlockingOrders, IN_TRANSIT_BLOCK_DAYS } from "./repo"

/**
 * The closure-blocking predicate against real Postgres. It must let weekly shoppers delete, must not
 * block forever on paid orders, and must block only goods genuinely in transit.
 */

const RUN = process.env.CONTAINER_TESTS === "1"

describe.skipIf(!RUN)("findBlockingOrders — against real PostgreSQL", () => {
  let container: StartedPostgreSqlContainer
  let pool: Pool

  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:16-alpine").start()
    pool = new Pool({ connectionString: container.getConnectionUri() })
    holder.pool = pool

    await pool.query(migrationSql())
    await pool.query(`INSERT INTO public.shop (code, name) VALUES ('S1', 'Shop One'), ('S2', 'Shop Two')`)
  }, 120_000)

  afterAll(async () => {
    await pool?.end()
    await container?.stop()
  })

  async function seedCustomer(): Promise<string> {
    const r = await pool.query<{ id: string }>(
      `INSERT INTO public.customer (cognito_sub, email) VALUES (gen_random_uuid()::text, gen_random_uuid()::text || '@example.test') RETURNING id`,
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
      `INSERT INTO public."order" (customer_id, order_number, status, created_at, delivery_address, item_subtotal_amount, grand_total_amount, delivery_type, delivery_type_reason, courier_estimate)
       VALUES ($1, 'EFY-' || substr(gen_random_uuid()::text, 1, 8), $2, now() - ($3 || ' days')::interval, '{}', 10, 10, 'courier', 'out_of_coverage', '2–4 business days')
       RETURNING id`,
      [customerId, status, String(daysAgo)],
    )
    const id = o.rows[0]!.id
    if (fulfillmentStatus) {
      await pool.query(
        `INSERT INTO public.shop_fulfillment (order_id, shop_id, item_count, subtotal_amount, status, unfulfillable_reason)
         VALUES ($1, (SELECT id FROM public.shop WHERE code = 'S1'), 1, 10, $2::text, CASE WHEN $2::text = 'unfulfillable' THEN 'Out of stock' END)`,
        [id, fulfillmentStatus],
      )
    }
    return id
  }

  /** A second portion on an order, so a rollup can be told from a max. */
  async function addPortion(orderId: string, status: string): Promise<void> {
    await pool.query(
      `INSERT INTO public.shop_fulfillment (order_id, shop_id, item_count, subtotal_amount, status, unfulfillable_reason)
         VALUES ($1, (SELECT id FROM public.shop WHERE code = 'S2'), 1, 10, $2::text, CASE WHEN $2::text = 'unfulfillable' THEN 'Out of stock' END)`,
      [orderId, status],
    )
  }

  const blockersFor = (customerId: string) => findBlockingOrders(customerId)

  it("blocks an order awaiting payment", async () => {
    const c = await seedCustomer()
    await seedOrder(c, "pending_payment", 0, null)

    const rows = await blockersFor(c)
    expect(rows).toHaveLength(1)
    expect(rows[0]!.status).toBe("pending_payment")
    // A block must state its end.
    expect(rows[0]!.clears_at).toBeInstanceOf(Date)
  })

  it("blocks a recent paid order whose fulfilment has not completed", async () => {
    const c = await seedCustomer()
    await seedOrder(c, "paid", 1, "picking")

    const rows = await blockersFor(c)
    expect(rows).toHaveLength(1)
    expect(rows[0]!.status).toBe("paid")
  })

  /** Without the age bound, a paid order would block forever. */
  it("STOPS blocking once a paid order ages past the bound", async () => {
    const c = await seedCustomer()
    await seedOrder(c, "paid", IN_TRANSIT_BLOCK_DAYS + 1, "picking")

    expect(await blockersFor(c)).toHaveLength(0)
  })

  /** Weekly shoppers must have days on which they can delete: the bound must not grow to the grace period. */
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

  /** Both directions: a delivered package releases, a package in transit blocks. */
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

  /** One customer's order never blocks another's deletion. */
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
    // `public."order"` calls it `order_number`, not `reference`.
    expect(rows[0]!.order_number).toMatch(/^EFY-/)
  })

  // Finished states must release: the predicate names what blocks, not what does not.

  it("does NOT block on a portion the shop said it cannot supply", async () => {
    const c = await seedCustomer()
    await seedOrder(c, "paid", 1, "unfulfillable")

    expect(
      await blockersFor(c),
      "nobody is carrying a portion the shop cannot supply — it must not block closure",
    ).toHaveLength(0)
  })

  it("does NOT block on a portion withdrawn by a cancellation", async () => {
    const c = await seedCustomer()
    await seedOrder(c, "paid", 1, "withdrawn")

    expect(
      await blockersFor(c),
      "a cancelled order's portion is finished — it must not block closure",
    ).toHaveLength(0)
  })

  // A rollup, not a max: one finished portion does not release an order whose other portion is in transit.
  it("STILL blocks when one portion is finished and another is in transit", async () => {
    const c = await seedCustomer()
    const order = await seedOrder(c, "paid", 1, "unfulfillable")
    await addPortion(order, "collected")

    expect(await blockersFor(c)).toHaveLength(1)
  })
})