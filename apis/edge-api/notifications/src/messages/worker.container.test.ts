import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { transactorFor, type Queryable, type Transactor } from "@effy/edge-shared";
import { applyPreferencesChange, CONSENT_WORDING_VERSION, notify, type NotifyInput } from "@effy/edge-shared/notifications";
import { OPERATING_TZ } from "@effy/shared-types";
import { migrationSql } from "@effy/edge-shared/testing";

import { runMessagesPass, type MessagesDeps } from "./worker";

/** 112 R3 - pages of people, one transaction each: no duplicate, no gap, stop between pages, at send time. */
const RUN = process.env.CONTAINER_TESTS === "1";
const d = RUN ? describe : describe.skip;

let container: StartedPostgreSqlContainer;
let pool: Pool;
let transact: Transactor;
let n = 0;

function deps(over: Partial<MessagesDeps> = {}): MessagesDeps & { inboxAnnounced: number; opsAnnounced: number } {
  const out = {
    db: pool as Queryable,
    transact,
    now: () => new Date(),
    deadline: Date.now() + 120_000,
    inboxAnnounced: 0,
    opsAnnounced: 0,
    announceOps: async () => {
      out.opsAnnounced += 1;
    },
    announceInbox: async (r: unknown[]) => {
      out.inboxAnnounced += r.length;
    },
    ...over,
  };
  return out;
}

async function message(
  kind: string,
  audiences: { audience: string; filter: object; destination: object }[],
  status = "sending",
  sendAt: Date = new Date(),
): Promise<string> {
  const id = (await pool.query<{ id: string }>(
    `INSERT INTO public.message (kind, title, body, status, send_at, created_by) VALUES ($1, 'From Effy', 'Hello from Effy', $2, $3, 'staff-1') RETURNING id::text AS id`,
    [kind, status, sendAt],
  )).rows[0]!.id;
  for (const a of audiences) {
    await pool.query(`INSERT INTO public.message_audience (message_id, audience, filter, destination) VALUES ($1, $2, $3::jsonb, $4::jsonb)`, [
      id, a.audience, JSON.stringify(a.filter), JSON.stringify(a.destination),
    ]);
  }
  return id;
}

async function customers(count: number, tag = `b${++n}`): Promise<string[]> {
  return (await pool.query<{ id: string }>(
    `INSERT INTO public.customer (cognito_sub, email)
     SELECT $1 || '-' || lpad(i::text, 6, '0'), ($1 || '-' || i || '@example.test')::citext FROM generate_series(1, $2) i
     RETURNING id::text AS id`,
    [tag, count],
  )).rows.map((r) => r.id);
}

async function driver(): Promise<{ id: string; sub: string }> {
  const sub = `drv-${++n}`;
  const id = (await pool.query<{ id: string }>(
    `INSERT INTO public.driver (cognito_sub, name, work_email) VALUES ($1, 'Driver', ($1 || '@effyshopping.com')::citext) RETURNING id::text AS id`,
    [sub],
  )).rows[0]!.id;
  return { id, sub };
}

const rowsOf = async (id: string) =>
  (await pool.query<{ audience: string; n: number; people: number }>(
    `SELECT audience, count(*)::int AS n, count(DISTINCT recipient_sub)::int AS people FROM public.notification WHERE message_id = $1 GROUP BY audience ORDER BY audience`,
    [id],
  )).rows;
const statusOf = async (id: string) =>
  (await pool.query<{ status: string; sent_at: Date | null }>(`SELECT status, sent_at FROM public.message WHERE id = $1`, [id])).rows[0]!;
const matched = async (id: string) =>
  (await pool.query<{ audience: string; matched_count: number }>(`SELECT audience, matched_count FROM public.message_audience WHERE message_id = $1 ORDER BY audience`, [id])).rows;

d("the messages worker (112 R3)", () => {
  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:16-alpine").start();
    pool = new Pool({ connectionString: container.getConnectionUri(), max: 8 });
    await pool.query(migrationSql());
    transact = transactorFor(pool);
  }, 120_000);

  afterAll(async () => {
    await pool?.end();
    await container?.stop();
  });

  it("an important message to customers, drivers and shops reaches each person once, then is sent", async () => {
    const ids = await customers(3);
    const drv = await driver();
    const shop = (await pool.query<{ id: string }>(`INSERT INTO public.shop (code, name) VALUES ('W1', 'Shop') RETURNING id::text AS id`)).rows[0]!.id;
    await pool.query(`INSERT INTO public.shop_staff (cognito_sub, email, name, status, shop_id) VALUES ('st-w1', 'st@example.test', 'Staff', 'active', $1)`, [shop]);
    // A person chosen twice (listed twice in the filter) still gets one.
    const id = await message("important", [
      { audience: "customer", filter: { people: [...ids, ids[0]] }, destination: { kind: "home" } },
      { audience: "driver", filter: { people: [drv.id] }, destination: { kind: "today" } },
      { audience: "shop", filter: { shops: [shop] }, destination: { kind: "queue" } },
    ]);
    const dd = deps();
    await runMessagesPass(dd);
    expect(await rowsOf(id)).toEqual([
      { audience: "customer", n: 3, people: 3 },
      { audience: "driver", n: 1, people: 1 },
      { audience: "shop", n: 1, people: 1 },
    ]);
    expect((await statusOf(id)).status).toBe("sent");
    expect(await matched(id)).toEqual([
      { audience: "customer", matched_count: 3 },
      { audience: "driver", matched_count: 1 },
      { audience: "shop", matched_count: 1 },
    ]);
    const pinned = (await pool.query(`SELECT count(*)::int AS n FROM public.notification WHERE message_id = $1 AND pinned_until IS NOT NULL`, [id])).rows[0].n;
    expect(pinned).toBe(5);
    expect(dd.opsAnnounced).toBe(1);
  });

  it("writes 20,000 customers in one pass (SC-002)", async () => {
    await customers(20_000, "big");
    // Everyone (no filter) is exactly these 20,000 while the other tests' customers are set aside.
    await pool.query(`UPDATE public.customer SET status = 'barred' WHERE cognito_sub NOT LIKE 'big-%'`);
    const all = await message("important", [{ audience: "customer", filter: {}, destination: { kind: "home" } }]);
    const started = Date.now();
    await runMessagesPass(deps());
    const took = Date.now() - started;
    console.log(`112 SC-002: 20,000 recipients written in ${took} ms`);
    expect(await rowsOf(all)).toEqual([{ audience: "customer", n: 20_000, people: 20_000 }]);
    expect((await statusOf(all)).status).toBe("sent");
    await pool.query(`UPDATE public.customer SET status = 'active' WHERE status = 'barred'`);
    await pool.query(`UPDATE public.customer SET status = 'barred' WHERE cognito_sub LIKE 'big-%'`);
  }, 300_000);

  it("a crash part-way and a second pass give every person exactly one (SC-003)", async () => {
    const ids = await customers(25, "crash");
    const id = await message("important", [{ audience: "customer", filter: { people: ids }, destination: { kind: "home" } }]);
    let pages = 0;
    const crashing = (tx: Queryable, input: NotifyInput) => {
      pages += 1;
      if (pages === 4) throw new Error("the sender stopped working");
      return notify(tx, input);
    };
    await expect(runMessagesPass(deps({ pageSize: 5, notify: crashing }))).rejects.toThrow(/stopped working/);
    // Three pages committed, the fourth rolled back.
    expect(await rowsOf(id)).toEqual([{ audience: "customer", n: 15, people: 15 }]);
    expect((await statusOf(id)).status).toBe("sending");
    await runMessagesPass(deps({ pageSize: 5 }));
    expect(await rowsOf(id)).toEqual([{ audience: "customer", n: 25, people: 25 }]);
    expect(await matched(id)).toEqual([{ audience: "customer", matched_count: 25 }]);
    expect((await statusOf(id)).status).toBe("sent");
  });

  it("two passes at once never write one message twice", async () => {
    const ids = await customers(40, "twin");
    const id = await message("important", [{ audience: "customer", filter: { people: ids }, destination: { kind: "home" } }]);
    await Promise.all([runMessagesPass(deps({ pageSize: 3 })), runMessagesPass(deps({ pageSize: 3 }))]);
    // Whatever one pass skipped, a later pass finishes.
    await runMessagesPass(deps({ pageSize: 3 }));
    expect(await rowsOf(id)).toEqual([{ audience: "customer", n: 40, people: 40 }]);
    const [m] = await matched(id);
    expect(m!.matched_count).toBe(40);
  });

  it("people are worked out when each page is written, not when the message was made (FR-010)", async () => {
    const drvA = await driver();
    const drvB = await driver();
    const id = await message("announcement", [{ audience: "driver", filter: { people: [drvA.id, drvB.id] }, destination: { kind: "today" } }]);
    await pool.query(`UPDATE public.driver SET status = 'suspended' WHERE id = $1`, [drvB.id]);
    await runMessagesPass(deps());
    expect(await rowsOf(id)).toEqual([{ audience: "driver", n: 1, people: 1 }]);
  });

  describe("due, stop, withdraw (US2)", () => {
    it("a scheduled message goes at its time, with its words as last edited", async () => {
      const drv = await driver();
      const id = await message("announcement", [{ audience: "driver", filter: { people: [drv.id] }, destination: { kind: "today" } }], "scheduled", new Date(Date.now() + 3_600_000));
      await runMessagesPass(deps());
      expect(await rowsOf(id)).toEqual([]);
      await pool.query(`UPDATE public.message SET title = 'Edited by Effy', send_at = now() - interval '1 second' WHERE id = $1`, [id]);
      await runMessagesPass(deps());
      expect((await statusOf(id)).status).toBe("sent");
      const t = (await pool.query(`SELECT title FROM public.notification WHERE message_id = $1`, [id])).rows[0].title;
      expect(t).toBe("Edited by Effy");
    });

    it("over the largest message when due: not sent, and says why", async () => {
      const a = await driver();
      const b = await driver();
      await pool.query(`UPDATE public.notification_settings SET max_recipients_per_message = 1`);
      const id = await message("announcement", [{ audience: "driver", filter: { people: [a.id, b.id] }, destination: { kind: "today" } }], "scheduled", new Date(Date.now() - 1000));
      await runMessagesPass(deps());
      await pool.query(`UPDATE public.notification_settings SET max_recipients_per_message = 20000`);
      const r = (await pool.query(`SELECT status, not_sent_reason FROM public.message WHERE id = $1`, [id])).rows[0];
      expect(r).toEqual({ status: "not_sent", not_sent_reason: "too_many_recipients" });
      expect(await rowsOf(id)).toEqual([]);
    });

    it("a stop between pages keeps those reached and no more", async () => {
      const ids = await customers(10, "stop");
      const id = await message("important", [{ audience: "customer", filter: { people: ids }, destination: { kind: "home" } }]);
      let pages = 0;
      const stopping = async (tx: Queryable, input: NotifyInput) => {
        const n = await notify(tx, input);
        pages += 1;
        // Staff press Stop while page 2 is being written: it waits for this page, then the next page sees it.
        if (pages === 2) void pool.query(`UPDATE public.message SET status = 'stopped' WHERE id = $1`, [id]);
        return n;
      };
      await runMessagesPass(deps({ pageSize: 3, notify: stopping }));
      await new Promise((r) => setTimeout(r, 200));
      expect((await statusOf(id)).status).toBe("stopped");
      const [row] = await rowsOf(id);
      expect(row!.n).toBeGreaterThanOrEqual(6);
      expect(row!.n).toBeLessThan(10);
    });

    it("a withdrawn message's recipients are told once, and its held pushes are never sent", async () => {
      const ids = await customers(3, "wd");
      const id = await message("important", [{ audience: "customer", filter: { people: ids }, destination: { kind: "home" } }]);
      await runMessagesPass(deps());
      await pool.query(`UPDATE public.notification_delivery d SET not_before = now() + interval '1 hour' FROM public.notification n WHERE n.id = d.notification_id AND n.message_id = $1`, [id]);
      await pool.query(`UPDATE public.message SET status = 'withdrawn', withdrawn_at = now() WHERE id = $1`, [id]);
      await pool.query(`UPDATE public.notification SET expires_at = now() WHERE message_id = $1`, [id]);
      const first = deps();
      await runMessagesPass(first);
      expect(first.inboxAnnounced).toBe(3);
      const again = deps();
      await runMessagesPass(again);
      expect(again.inboxAnnounced).toBe(0);
      const listed = (await pool.query(`SELECT count(*)::int AS n FROM public.notification WHERE message_id = $1 AND (expires_at IS NULL OR expires_at > now())`, [id])).rows[0].n;
      expect(listed).toBe(0);
    });
  });

  describe("offers and news (US6, SC-004)", () => {
    async function said(customerId: string, offers: boolean) {
      await transact((tx) => applyPreferencesChange(tx, customerId, { surface: "app", via: "settings", consent: { offers }, wordingVersion: CONSENT_WORDING_VERSION }));
    }
    const idsAndSubs = async (tag: string) => {
      const ids = await customers(3, tag);
      const subs = (await pool.query<{ sub: string }>(`SELECT cognito_sub AS sub FROM public.customer WHERE id = ANY($1::uuid[]) ORDER BY cognito_sub`, [ids])).rows.map((r) => r.sub);
      return { ids, subs };
    };
    /** 22:00 on Effy's clock tonight. */
    async function tenPm(): Promise<Date> {
      return (await pool.query<{ t: Date }>(`SELECT (date_trunc('day', now() AT TIME ZONE $1) + interval '22 hours') AT TIME ZONE $1 AS t`, [OPERATING_TZ])).rows[0]!.t;
    }

    it("only the customer who said yes gets it; a second the same day is inbox only; at night the push waits", async () => {
      const { ids, subs } = await idsAndSubs("promo");
      await said(ids[0]!, true);
      await said(ids[1]!, false);
      const at = await tenPm();
      const night = (tx: Queryable, input: NotifyInput) => notify(tx, input, { now: at });
      const first = await message("offer", [{ audience: "customer", filter: { people: ids }, destination: { kind: "sale" } }]);
      await runMessagesPass(deps({ notify: night }));
      const r1 = (await pool.query(
        `SELECT n.recipient_sub, d.status, d.not_before IS NOT NULL AS held FROM public.notification n JOIN public.notification_delivery d ON d.notification_id = n.id WHERE n.message_id = $1`,
        [first],
      )).rows;
      expect(r1).toEqual([{ recipient_sub: subs[0], status: "pending", held: true }]);
      expect(await matched(first)).toEqual([{ audience: "customer", matched_count: 3 }]);

      const second = await message("offer", [{ audience: "customer", filter: { people: ids }, destination: { kind: "sale" } }]);
      await runMessagesPass(deps({ notify: night }));
      const r2 = (await pool.query(`SELECT d.status FROM public.notification n JOIN public.notification_delivery d ON d.notification_id = n.id WHERE n.message_id = $1`, [second])).rows;
      expect(r2).toEqual([{ status: "capped" }]);
    });

    it("a yes taken back after scheduling: not sent to them", async () => {
      const { ids } = await idsAndSubs("taken");
      await said(ids[0]!, true);
      const id = await message("news", [{ audience: "customer", filter: { people: [ids[0]!] }, destination: { kind: "home" } }], "scheduled", new Date(Date.now() - 1000));
      await transact((tx) => applyPreferencesChange(tx, ids[0]!, { surface: "app", via: "settings", consent: { news: false }, wordingVersion: CONSENT_WORDING_VERSION }));
      await runMessagesPass(deps());
      expect(await rowsOf(id)).toEqual([]);
    });
  });
});
