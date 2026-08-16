import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql"
import { Pool } from "pg"
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

/**
 * ⚠ Real PostgreSQL 16 — the load-bearing behaviour is in the SQL:
 *   • combinable filters + trigram search over message/email (FR-019/020);
 *   • the reply write + status→replied in ONE transaction (FR-029);
 *   • notes/replies joined by reference_code and ordered.
 * Gated behind CONTAINER_TESTS=1 so ordinary unit runs stay Docker-free.
 */
const holder = vi.hoisted(() => ({ pool: null as Pool | null }))

vi.mock("@effy/edge-shared", () => ({
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

describe.skipIf(!RUN)("feedback console repo — against real PostgreSQL", () => {
  let container: StartedPostgreSqlContainer
  let pool: Pool

  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:16-alpine").start()
    pool = new Pool({ connectionString: container.getConnectionUri() })
    holder.pool = pool
    await pool.query(`
      CREATE EXTENSION IF NOT EXISTS citext;
      CREATE EXTENSION IF NOT EXISTS pg_trgm;
      CREATE TABLE public.feedback_submission (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        reference_code text NOT NULL UNIQUE,
        category text NOT NULL, message text NOT NULL, rating smallint,
        submitter_name text, submitter_email citext, email_verified boolean NOT NULL DEFAULT false,
        customer_id uuid, source text NOT NULL DEFAULT 'general', platform text NOT NULL,
        status text NOT NULL DEFAULT 'new', source_key text,
        created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE public.feedback_reply (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        submission_id uuid NOT NULL REFERENCES public.feedback_submission(id) ON DELETE CASCADE,
        body text NOT NULL, staff_sub text NOT NULL, staff_name text,
        sent_at timestamptz NOT NULL DEFAULT now(), delivery_ok boolean NOT NULL DEFAULT true
      );
      CREATE TABLE public.feedback_note (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        submission_id uuid NOT NULL REFERENCES public.feedback_submission(id) ON DELETE CASCADE,
        body text NOT NULL, staff_sub text NOT NULL, staff_name text,
        created_at timestamptz NOT NULL DEFAULT now()
      );
    `)
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

  const emptyParams = { q: null, category: null, status: null, rating: null, from: null, to: null, limit: 25, offset: 0 }

  it("lists newest-first and paginates", async () => {
    await seed(pool, { reference_code: "FB-OLD", created_at: "2026-08-01T00:00:00Z" })
    await seed(pool, { reference_code: "FB-NEW", created_at: "2026-08-10T00:00:00Z" })
    const page = await repo.list({ ...emptyParams, limit: 1 })
    expect(page.total).toBe(2)
    expect(page.items[0]!.reference_code).toBe("FB-NEW")
  })

  it("searches message and email; filters by category/status/rating combinably", async () => {
    await seed(pool, { reference_code: "FB-A", message: "the checkout is slow", category: "bug", status: "new", rating: 2 })
    await seed(pool, { reference_code: "FB-B", message: "love the app", category: "compliment", status: "resolved", rating: 5, submitter_email: "fan@x.com" })

    expect((await repo.list({ ...emptyParams, q: "checkout" })).total).toBe(1)
    expect((await repo.list({ ...emptyParams, q: "fan@x.com" })).total).toBe(1)
    expect((await repo.list({ ...emptyParams, category: "bug", status: "new", rating: 2 })).total).toBe(1)
    expect((await repo.list({ ...emptyParams, category: "bug", status: "resolved" })).total).toBe(0)
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

    // A second reply accumulates (FR-031) and status stays replied.
    await repo.insertReplyAndMarkReplied(ref, "one more thing", { sub: "s1", name: "Alex" })
    expect(await repo.listReplies(ref)).toHaveLength(2)

    expect(await repo.insertReplyAndMarkReplied("FB-NONE", "x", { sub: "s1", name: null })).toBe(false)
  })
})
