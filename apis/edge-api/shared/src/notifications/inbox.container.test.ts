import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { transactorFor, type Transactor } from "../lib/db";
import { migrationSql } from "../testing/migrations";
import type { NotificationType } from "./catalogue";
import { endsLabel, listInbox, markSeen, readAll, setArchived, unseenCount } from "./inbox";
import { notify } from "./notify";

/** 110 - a person's inbox, against real PostgreSQL: order, paging, filters, pins, seen, read-all, archive, ownership. */
const RUN = process.env.CONTAINER_TESTS === "1";
const d = RUN ? describe : describe.skip;

let container: StartedPostgreSqlContainer;
let pool: Pool;
let transact: Transactor;
let seq = 0;

/** One notification for `sub`, created `minutesAgo` minutes ago. Returns its id. */
async function note(
  sub: string,
  type: NotificationType = "order_paid",
  minutesAgo = 0,
  extra: { expiresInMin?: number; pinnedForMin?: number; category?: string } = {},
): Promise<string> {
  const scope = `s-${++seq}`;
  await transact((tx) => notify(tx, { type, recipients: [{ sub }], subject: { entityId: `e-${seq}`, orderId: `o-${seq}`, count: 1 }, dedupeScope: scope, channels: ["push"] }));
  const id = (await pool.query<{ id: string }>(`SELECT id::text AS id FROM public.notification WHERE dedupe_key LIKE $1`, [`%:${scope}`])).rows[0]!.id;
  await pool.query(
    `UPDATE public.notification
        SET created_at = now() - make_interval(mins => $2),
            expires_at = CASE WHEN $3::int IS NULL THEN NULL ELSE now() + make_interval(mins => $3::int) END,
            pinned_until = CASE WHEN $4::int IS NULL THEN NULL ELSE now() + make_interval(mins => $4::int) END,
            category = COALESCE($5, category)
      WHERE id = $1`,
    [id, minutesAgo, extra.expiresInMin ?? null, extra.pinnedForMin ?? null, extra.category ?? null],
  );
  return id;
}

const ids = (page: { items: { id: string }[] }) => page.items.map((i) => i.id);

d("the inbox (110)", () => {
  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:16-alpine").start();
    pool = new Pool({ connectionString: container.getConnectionUri() });
    await pool.query(migrationSql());
    transact = transactorFor(pool);
  }, 120_000);

  afterAll(async () => {
    await pool?.end();
    await container?.stop();
  });

  beforeEach(async () => {
    await pool.query("TRUNCATE public.notification_delivery, public.notification CASCADE");
  });

  it("lists newest first with the words, destination and state (FR-001, FR-002)", async () => {
    const old = await note("c-1", "order_paid", 60);
    const recent = await note("c-1", "order_ready", 5);
    const page = await listInbox("c-1", "customer", {}, pool);
    expect(ids(page)).toEqual([recent, old]);
    expect(page.items[0]).toMatchObject({
      type: "order_ready", category: "orders", importance: "normal", title: "Your order is packed",
      destination: { kind: "order" }, readAt: null, pinnedUntil: null, endsLabel: null,
    });
    expect(page.items[0]!.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/);
    expect(page).toMatchObject({ pinned: [], nextCursor: null, categories: ["orders"], unseenCount: 2 });
  });

  it("pages through 1,000 notifications with none lost or repeated (SC-005)", async () => {
    // Several share a created_at, so the id breaks the tie.
    await pool.query(
      `INSERT INTO public.notification (recipient_sub, audience, type, category, title, body, destination, dedupe_key, created_at)
       SELECT 'c-many', 'customer', 'order_paid', 'orders', 'Order confirmed', 'x', '{"kind":"orders"}', 'k' || g,
              now() - make_interval(secs => g / 3)
         FROM generate_series(1, 1000) g`,
    );
    const seen = new Set<string>();
    let cursor: string | undefined;
    let pages = 0;
    do {
      const page = await listInbox("c-many", "customer", { cursor, limit: 50 }, pool);
      for (const id of ids(page)) {
        expect(seen.has(id)).toBe(false);
        seen.add(id);
      }
      if (pages > 0) expect(page.categories).toBeNull();
      cursor = page.nextCursor ?? undefined;
      pages++;
    } while (cursor);
    expect(seen.size).toBe(1000);
    expect(pages).toBe(20);
  });

  it("filters by unread and by category, and offers only the categories it holds (FR-007)", async () => {
    const read = await note("c-2", "order_paid", 30);
    const unread = await note("c-2", "order_ready", 20);
    const points = await note("c-2", "points_credited", 10);
    await pool.query(`UPDATE public.notification SET read_at = now(), seen_at = now() WHERE id = $1`, [read]);

    expect(ids(await listInbox("c-2", "customer", { filter: "unread" }, pool))).toEqual([points, unread]);
    expect(ids(await listInbox("c-2", "customer", { category: "points" }, pool))).toEqual([points]);
    expect((await listInbox("c-2", "customer", {}, pool)).categories).toEqual(["orders", "points"]);
  });

  it("keeps a pinned important item apart, above the list, until it is read or its pin ends (FR-003)", async () => {
    const plain = await note("d-1", "run_assigned", 30);
    const pinned = await note("d-1", "driver_runs_today", 10, { pinnedForMin: 60 });
    const ended = await note("d-1", "driver_runs_today", 5, { pinnedForMin: -1 });

    let page = await listInbox("d-1", "driver", {}, pool);
    expect(page.pinned.map((i) => i.id)).toEqual([pinned]);
    expect(ids(page)).toEqual([ended, plain]);

    await pool.query(`UPDATE public.notification SET read_at = now(), seen_at = now() WHERE id = $1`, [pinned]);
    page = await listInbox("d-1", "driver", {}, pool);
    expect(page.pinned).toEqual([]);
    expect(ids(page)).toEqual([ended, pinned, plain]);
  });

  it("never lists or counts an ended or archived item (FR-004, FR-005)", async () => {
    const live = await note("c-3", "order_paid", 3, { expiresInMin: 60 });
    await note("c-3", "order_paid", 2, { expiresInMin: -1 });
    const archived = await note("c-3", "order_paid", 1);
    await setArchived("c-3", "customer", archived, true, pool);
    expect(ids(await listInbox("c-3", "customer", {}, pool))).toEqual([live]);
    expect(await unseenCount("c-3", "customer", pool)).toBe(1);
  });

  it("seen clears the count up to the cut-off only; a later one stays unseen and nothing becomes read (FR-010, FR-011)", async () => {
    await note("c-4", "order_paid", 10);
    const shown = await note("c-4", "order_ready", 5);
    const shownAt = (await listInbox("c-4", "customer", {}, pool)).items.find((i) => i.id === shown)!.createdAt;
    const later = await note("c-4", "order_delivered", 0);

    expect(await markSeen("c-4", "customer", shownAt, pool)).toBe(1);
    const rows = (await pool.query(`SELECT id::text AS id, seen_at, read_at FROM public.notification WHERE recipient_sub = 'c-4'`)).rows;
    expect(rows.find((r) => r.id === later)!.seen_at).toBeNull();
    expect(rows.every((r) => r.read_at === null)).toBe(true);
  });

  it("the cut-off is exact to the microsecond: the newest item shown is itself seen", async () => {
    await note("c-4b", "order_paid", 0);
    const shownAt = (await listInbox("c-4b", "customer", {}, pool)).items[0]!.createdAt;
    expect(await markSeen("c-4b", "customer", shownAt, pool)).toBe(0);
  });

  it("mark all read covers items not yet loaded and leaves a later one unread (FR-014)", async () => {
    for (let i = 0; i < 40; i++) await note("c-5", "order_paid", 100 - i);
    const cut = new Date().toISOString();
    const later = await note("c-5", "order_ready", -1); // one minute in the future: arrived after the tap
    const res = await readAll("c-5", "customer", cut, pool);
    expect(res.updated).toBe(40);
    expect(ids(await listInbox("c-5", "customer", { filter: "unread", limit: 50 }, pool))).toEqual([later]);
  });

  it("archive then undo puts it back exactly as it was (FR-016, FR-017)", async () => {
    const a = await note("c-6", "order_paid", 5);
    await pool.query(`UPDATE public.notification SET read_at = now(), seen_at = now() WHERE id = $1`, [a]);
    expect(await setArchived("c-6", "customer", a, true, pool)).toBe(true);
    expect(await setArchived("c-6", "customer", a, true, pool)).toBe(true);
    expect(ids(await listInbox("c-6", "customer", {}, pool))).toEqual([]);
    expect(await setArchived("c-6", "customer", a, false, pool)).toBe(true);
    const page = await listInbox("c-6", "customer", {}, pool);
    expect(ids(page)).toEqual([a]);
    expect(page.items[0]!.readAt).not.toBeNull();
  });

  it("another person's or another audience's item is not there, and is left alone (FR-027, FR-028)", async () => {
    const mine = await note("c-7", "order_paid", 5);
    expect(await setArchived("c-other", "customer", mine, true, pool)).toBe(false);
    expect(await setArchived("c-7", "shop", mine, true, pool)).toBe(false);
    expect(ids(await listInbox("c-other", "customer", {}, pool))).toEqual([]);
    expect(ids(await listInbox("c-7", "driver", {}, pool))).toEqual([]);
    await readAll("c-other", "customer", new Date().toISOString(), pool);
    await markSeen("c-7", "shop", new Date().toISOString(), pool);
    const row = (await pool.query(`SELECT archived_at, seen_at, read_at FROM public.notification WHERE id = $1`, [mine])).rows[0];
    expect(row).toEqual({ archived_at: null, seen_at: null, read_at: null });
  });

  it("says when an offer ends, and says nothing for a housekeeping expiry (R15)", async () => {
    await note("c-8", "order_paid", 1, { expiresInMin: 60, category: "offers" });
    await note("d-8", "run_opens_soon", 1, { expiresInMin: 60 });
    expect((await listInbox("c-8", "customer", {}, pool)).items[0]!.endsLabel).toMatch(/^Ends /);
    expect((await listInbox("d-8", "driver", {}, pool)).items[0]!.endsLabel).toBeNull();
  });
});

describe("endsLabel (110 R15)", () => {
  const now = new Date("2026-11-09T01:00:00Z"); // Monday noon in Melbourne
  it.each([
    ["2026-11-09T06:00:00Z", "Ends today 5 pm"],
    ["2026-11-10T06:00:00Z", "Ends tomorrow"],
    ["2026-11-15T06:00:00Z", "Ends Sun"],
    ["2026-11-20T06:00:00Z", "Ends 20 Nov"],
  ])("%s → %s", (at, label) => {
    expect(endsLabel("offers", new Date(at), now)).toBe(label);
  });

  it("only for the categories where an end means something", () => {
    expect(endsLabel("work", new Date("2026-11-10T06:00:00Z"), now)).toBeNull();
    expect(endsLabel("offers", null, now)).toBeNull();
  });
});
