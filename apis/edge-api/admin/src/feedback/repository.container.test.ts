import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql"
import { migrationSql } from "@effy/edge-shared/testing"
import { Pool } from "pg"
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

/** Filters and trigram search, the reply + status in one transaction, notes and replies in order. */
const holder = vi.hoisted(() => ({ pool: null as Pool | null }))

vi.mock("@effy/edge-shared", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@effy/edge-shared")>()),
  query: (text: string, params?: unknown[]) => holder.pool!.query(text, params as never[]),
  withTransaction: async (fn: (c: unknown) => unknown) => {
    const client = await holder.pool!.connect()
    try {
      await client.query("BEGIN")
      const out = await fn(client)
      await client.query("COMMIT")
      return out
    } catch (e) {
      await client.query("ROLLBACK")
      throw e
    } finally {
      client.release()
    }
  },
}))

import * as repo from "./repository"
import { parseListQuery } from "@effy/edge-shared"
import { FEEDBACK_LIST_SPEC } from "./list"

const RUN = process.env.CONTAINER_TESTS === "1"

async function seed(pool: Pool, overrides: Record<string, unknown> = {}): Promise<string> {
  const ref = (overrides.reference_code as string) ?? `FB-${Math.random().toString(36).slice(2, 8).toUpperCase()}`
  await pool.query(
    `INSERT INTO public.feedback_submission
       (reference_code, category, message, rating, submitter_email, source, platform, status, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,'web',$7, COALESCE($8, now()))`,
    [
      ref,
      overrides.category ?? "suggestion",
      overrides.message ?? "please add dark mode",
      overrides.rating ?? null,
      overrides.submitter_email ?? "sam@example.com",
      overrides.source ?? "general",
      overrides.status ?? "new",
      overrides.created_at ?? null,
    ],
  )
  return ref
}

describe.skipIf(!RUN)("feedback console repo - against real PostgreSQL", () => {
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
    await pool.query(
      "TRUNCATE public.feedback_note, public.feedback_reply, public.feedback_submission RESTART IDENTITY CASCADE",
    )
  })

  const list = (qs: Record<string, string> = {}) => repo.list(parseListQuery({ view: "all", ...qs }, FEEDBACK_LIST_SPEC))

  it("lists newest-first and pages, ties at the page edge included (103)", async () => {
    await seed(pool, { reference_code: "FB-OLD", created_at: "2026-08-01T00:00:00Z" })
    await seed(pool, { reference_code: "FB-NEW", created_at: "2026-08-10T00:00:00Z" })
    const page = await list()
    expect(page.total).toBe(2)
    expect(page.rows[0]!.reference_code).toBe("FB-NEW")
    for (let i = 0; i < 28; i++) await seed(pool, { reference_code: `FB-T${i}`, created_at: "2026-08-05T00:00:00Z" })
    const seen = [...(await list({ pageSize: "25" })).rows, ...(await list({ pageSize: "25", page: "2" })).rows].map((r) => r.reference_code)
    expect(new Set(seen).size).toBe(30)
  })

  it("searches message, email and reference; filters by view/category/rating combinably; counts views at once", async () => {
    await seed(pool, { reference_code: "FB-A", message: "the checkout is slow", category: "bug", status: "new", rating: 2 })
    await seed(pool, { reference_code: "FB-B", message: "love the app", category: "compliment", status: "resolved", rating: 5, submitter_email: "fan@x.com" })

    expect((await list({ q: "checkout" })).total).toBe(1)
    expect((await list({ q: "fan@x.com" })).total).toBe(1)
    expect((await list({ q: "FB-B" })).total).toBe(1)
    expect((await list({ category: "bug", view: "new", rating: "2" })).total).toBe(1)
    expect((await list({ category: "bug", view: "resolved" })).total).toBe(0)
    expect((await list({ view: "open" })).total).toBe(1)
    expect(await repo.viewCounts(parseListQuery({}, FEEDBACK_LIST_SPEC))).toMatchObject({ open: 1, new: 1, resolved: 1, all: 2 })
  })

  it("changes status and returns false for an unknown reference", async () => {
    const ref = await seed(pool)
    expect(await repo.updateStatus(ref, "in_review")).toBe(true)
    expect((await repo.getByReference(ref))!.status).toBe("in_review")
    expect(await repo.updateStatus("FB-NONE", "resolved")).toBe(false)
  })

  it("adds notes attributed and ordered", async () => {
    const ref = await seed(pool)
    await repo.insertNote(ref, "first", { sub: "s1", name: "Alex" })
    await repo.insertNote(ref, "second", { sub: "s2", name: "Bо" })
    const notes = await repo.listNotes(ref)
    expect(notes.map((n) => n.body)).toEqual(["first", "second"])
  })

  it("writes a reply AND flips status to replied in one transaction", async () => {
    const ref = await seed(pool)
    expect(await repo.insertReplyAndMarkReplied(ref, "thanks!", { sub: "s1", name: "Alex" })).toBe(true)
    expect((await repo.getByReference(ref))!.status).toBe("replied")
    expect(await repo.listReplies(ref)).toHaveLength(1)

    // A second reply accumulates and status stays replied.
    await repo.insertReplyAndMarkReplied(ref, "one more thing", { sub: "s1", name: "Alex" })
    expect(await repo.listReplies(ref)).toHaveLength(2)

    expect(await repo.insertReplyAndMarkReplied("FB-NONE", "x", { sub: "s1", name: null })).toBe(false)
  })
})
