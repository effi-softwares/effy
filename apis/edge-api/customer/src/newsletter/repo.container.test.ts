import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql"
import { Pool } from "pg"
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

/**
 * ⚠ The shared `query` helper forces SSL with the embedded RDS CA bundle, so pointing it at a local
 * container via DB_* env vars cannot work. The transport is replaced here; the SQL is NOT — the
 * statements under test are the real ones from `./repo`, executed against real PostgreSQL 16.
 */
const holder = vi.hoisted(() => ({ pool: null as Pool | null }))

vi.mock("@effy/edge-shared", () => ({
  query: (text: string, params?: unknown[]) => holder.pool!.query(text, params as never[]),
  withTransaction: async (fn: (c: unknown) => unknown) => fn(holder.pool),
}))

import { confirmSubscriber, upsertSubscriber } from "./repo"

/**
 * ⚠ WHY THIS NEEDS REAL POSTGRESQL AND A MOCK WOULD BE WORTHLESS.
 *
 * Everything load-bearing about this repository is a property of the DATABASE, not of the code:
 *
 *   • `citext` is what makes `A@b.com` and `a@b.com` one person. A mock cannot have a collation.
 *   • The cooldown lives inside `ON CONFLICT DO UPDATE … WHERE`, so "did it suppress the resend?" is
 *     answered by whether Postgres returned a row — a mock would just return whatever it was told.
 *   • Single-use confirm is enforced by the UPDATE clearing the hash, not by a flag anyone checks.
 *
 * These are exactly the three things the service's unit tests take on faith.
 *
 * Gated behind `CONTAINER_TESTS=1`, so ordinary unit runs stay Docker-free (matching `closure/`).
 */
const RUN = process.env.CONTAINER_TESTS === "1"

describe.skipIf(!RUN)("newsletter repo — against real PostgreSQL", () => {
  let container: StartedPostgreSqlContainer
  let pool: Pool

  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:16-alpine").start()
    pool = new Pool({ connectionString: container.getConnectionUri() })
    holder.pool = pool

    // ⚠ The real schema, copied from the migration. If a future migration renames a column this fails
    // loudly rather than silently matching nothing.
    await pool.query(`
      CREATE EXTENSION IF NOT EXISTS citext;
      CREATE TABLE public.newsletter_subscriber (
        id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        email              citext NOT NULL UNIQUE,
        status             text NOT NULL DEFAULT 'pending'
                           CHECK (status IN ('pending','confirmed','unsubscribed')),
        confirm_token_hash text,
        confirm_sent_at    timestamptz,
        confirmed_at       timestamptz,
        created_at         timestamptz NOT NULL DEFAULT now(),
        updated_at         timestamptz NOT NULL DEFAULT now()
      );
    `)
  }, 180_000)

  afterAll(async () => {
    await pool?.end()
    await container?.stop()
  })

  beforeEach(async () => {
    await pool.query(`TRUNCATE public.newsletter_subscriber`)
  })

  const rowFor = async (email: string) =>
    (
      await pool.query<{
        status: string
        confirm_token_hash: string | null
        confirm_sent_at: Date | null
        confirmed_at: Date | null
      }>(`SELECT status, confirm_token_hash, confirm_sent_at, confirmed_at
            FROM public.newsletter_subscriber WHERE email = $1`, [email])
    ).rows[0]

  describe("subscribe is idempotent on the address", () => {
    it("creates one pending row and says a send is due", async () => {
      const r = await upsertSubscriber({ email: "a@example.com", tokenHash: "h1", cooldownMinutes: 60 })

      expect(r.sendDue).toBe(true)
      expect(await rowFor("a@example.com")).toMatchObject({ status: "pending", confirm_token_hash: "h1" })
    })

    /**
     * ⚠ `citext`, PROVEN. A UNIQUE index on plain `text` would happily hold both of these as separate
     * people and send two confirmation emails to one inbox.
     */
    it("treats differently-cased addresses as ONE row", async () => {
      await upsertSubscriber({ email: "person@example.com", tokenHash: "h1", cooldownMinutes: 60 })
      await upsertSubscriber({ email: "PERSON@EXAMPLE.COM", tokenHash: "h2", cooldownMinutes: 0 })

      const count = await pool.query(`SELECT count(*)::int AS n FROM public.newsletter_subscriber`)
      expect(count.rows[0].n).toBe(1)
    })

    /** ⚠ FR-035's actual enforcement — the whole of it, now that the gateway throttle is gone. */
    it("SUPPRESSES the resend inside the cooldown, and rotates nothing", async () => {
      await upsertSubscriber({ email: "a@example.com", tokenHash: "first", cooldownMinutes: 60 })
      const second = await upsertSubscriber({ email: "a@example.com", tokenHash: "second", cooldownMinutes: 60 })

      expect(second.sendDue).toBe(false)
      // ⚠ The token must NOT have rotated: rotating it would invalidate the link already in the
      // subscriber's inbox while sending no replacement — the worst of both.
      expect((await rowFor("a@example.com"))!.confirm_token_hash).toBe("first")
    })

    it("allows a resend once the cooldown has elapsed, rotating the token", async () => {
      await upsertSubscriber({ email: "a@example.com", tokenHash: "first", cooldownMinutes: 60 })
      await pool.query(
        `UPDATE public.newsletter_subscriber SET confirm_sent_at = now() - interval '2 hours'`,
      )

      const again = await upsertSubscriber({ email: "a@example.com", tokenHash: "second", cooldownMinutes: 60 })

      expect(again.sendDue).toBe(true)
      expect((await rowFor("a@example.com"))!.confirm_token_hash).toBe("second")
    })

    /** ⚠ Re-subscribing a confirmed address is a silent no-op — no email, no token, no error. */
    it("leaves a CONFIRMED row completely untouched", async () => {
      await upsertSubscriber({ email: "a@example.com", tokenHash: "h1", cooldownMinutes: 0 })
      await confirmSubscriber({ tokenHash: "h1", ttlHours: 24 })

      const again = await upsertSubscriber({ email: "a@example.com", tokenHash: "h2", cooldownMinutes: 0 })

      expect(again.sendDue).toBe(false)
      expect(await rowFor("a@example.com")).toMatchObject({
        status: "confirmed",
        confirm_token_hash: null,
      })
    })

    it("never creates a second row for the same address, however many times it is submitted", async () => {
      for (let i = 0; i < 10; i++) {
        await upsertSubscriber({ email: "a@example.com", tokenHash: `h${i}`, cooldownMinutes: 60 })
      }

      const count = await pool.query(`SELECT count(*)::int AS n FROM public.newsletter_subscriber`)
      expect(count.rows[0].n).toBe(1)
    })
  })

  describe("confirm is single-use and TTL-bounded", () => {
    it("confirms a pending row and clears the token", async () => {
      await upsertSubscriber({ email: "a@example.com", tokenHash: "tok", cooldownMinutes: 0 })

      expect(await confirmSubscriber({ tokenHash: "tok", ttlHours: 24 })).toEqual({ confirmed: true })

      const row = await rowFor("a@example.com")
      expect(row).toMatchObject({ status: "confirmed", confirm_token_hash: null })
      expect(row!.confirmed_at).not.toBeNull()
    })

    /** ⚠ Single-use BY CONSTRUCTION — the hash is gone, so there is nothing left to match. */
    it("refuses the same token a second time", async () => {
      await upsertSubscriber({ email: "a@example.com", tokenHash: "tok", cooldownMinutes: 0 })
      await confirmSubscriber({ tokenHash: "tok", ttlHours: 24 })

      expect(await confirmSubscriber({ tokenHash: "tok", ttlHours: 24 })).toEqual({ confirmed: false })
    })

    it("refuses a token past its TTL", async () => {
      await upsertSubscriber({ email: "a@example.com", tokenHash: "tok", cooldownMinutes: 0 })
      await pool.query(
        `UPDATE public.newsletter_subscriber SET confirm_sent_at = now() - interval '48 hours'`,
      )

      expect(await confirmSubscriber({ tokenHash: "tok", ttlHours: 24 })).toEqual({ confirmed: false })
      expect((await rowFor("a@example.com"))!.status).toBe("pending")
    })

    it("refuses a token that never existed", async () => {
      expect(await confirmSubscriber({ tokenHash: "nope", ttlHours: 24 })).toEqual({ confirmed: false })
    })

    it("confirms only the row that owns the token", async () => {
      await upsertSubscriber({ email: "a@example.com", tokenHash: "tok-a", cooldownMinutes: 0 })
      await upsertSubscriber({ email: "b@example.com", tokenHash: "tok-b", cooldownMinutes: 0 })

      await confirmSubscriber({ tokenHash: "tok-a", ttlHours: 24 })

      expect((await rowFor("a@example.com"))!.status).toBe("confirmed")
      expect((await rowFor("b@example.com"))!.status).toBe("pending")
    })
  })
})
