import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql"
import { migrationSql } from "@effy/edge-shared/testing"
import { Pool } from "pg"
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

/** The rate limit inside the INSERT, the reference unique, and the linked-vs-guest columns, against real Postgres. */
const holder = vi.hoisted(() => ({ pool: null as Pool | null }))

vi.mock("@effy/edge-shared", () => ({
  query: (text: string, params?: unknown[]) => holder.pool!.query(text, params as never[]),
  withTransaction: async (fn: (c: unknown) => unknown) => fn(holder.pool),
}))

import { findCustomerBySub, insertSubmission, type InsertSubmissionInput } from "./repo"

const RUN = process.env.CONTAINER_TESTS === "1"

const base: Omit<InsertSubmissionInput, "referenceCode" | "sourceKey"> = {
  category: "suggestion",
  message: "Add dark mode please",
  rating: 4,
  submitterName: "Sam",
  submitterEmail: "sam@example.com",
  emailVerified: false,
  customerId: null,
  source: "general",
  platform: "web",
  windowMinutes: 60,
  maxPerWindow: 3,
}

describe.skipIf(!RUN)("feedback repo - against real PostgreSQL", () => {
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
    await pool.query("DELETE FROM public.feedback_submission; DELETE FROM public.customer;")
  })

  it("inserts and returns the reference code", async () => {
    const r = await insertSubmission({ ...base, referenceCode: "FB-AAA111", sourceKey: "k1" })
    expect(r).toEqual({ status: "ok", referenceCode: "FB-AAA111" })
    const rows = await pool.query("SELECT reference_code, status FROM public.feedback_submission")
    expect(rows.rows[0]).toMatchObject({ reference_code: "FB-AAA111", status: "new" })
  })

  it("refuses once the per-source window cap is reached, then allows a DIFFERENT source", async () => {
    for (let i = 0; i < base.maxPerWindow; i++) {
      const r = await insertSubmission({ ...base, referenceCode: `FB-K${i}`, sourceKey: "same" })
      expect(r.status).toBe("ok")
    }
    const over = await insertSubmission({ ...base, referenceCode: "FB-OVER", sourceKey: "same" })
    expect(over).toEqual({ status: "rate_limited" })

    const other = await insertSubmission({ ...base, referenceCode: "FB-OTHER", sourceKey: "different" })
    expect(other.status).toBe("ok")
  })

  it("throws a unique violation on a duplicate reference code", async () => {
    await insertSubmission({ ...base, referenceCode: "FB-DUP", sourceKey: "a" })
    await expect(
      insertSubmission({ ...base, referenceCode: "FB-DUP", sourceKey: "b" }),
    ).rejects.toMatchObject({ code: "23505" })
  })

  it("links a signed-in submission and looks the customer up by sub", async () => {
    const c = await pool.query(
      `INSERT INTO public.customer (cognito_sub, email, given_name, family_name)
       VALUES ('sub-1','real@profile.com','Sam','Lee') RETURNING id`,
    )
    const customerId = c.rows[0].id as string

    const found = await findCustomerBySub("sub-1")
    expect(found).toMatchObject({ id: customerId, email: "real@profile.com", givenName: "Sam" })
    expect(await findCustomerBySub("nope")).toBeNull()

    await insertSubmission({
      ...base,
      referenceCode: "FB-LINK",
      sourceKey: "s",
      customerId,
      submitterEmail: "real@profile.com",
      emailVerified: true,
    })
    const row = await pool.query(
      "SELECT customer_id, email_verified FROM public.feedback_submission WHERE reference_code='FB-LINK'",
    )
    expect(row.rows[0]).toMatchObject({ customer_id: customerId, email_verified: true })
  })
})
