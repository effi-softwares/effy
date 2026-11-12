import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { transactorFor, type Queryable, type Transactor } from "@effy/edge-shared";
import { applyPreferencesChange, CONSENT_WORDING_VERSION } from "@effy/edge-shared/notifications";
import { insertTestProduct, migrationSql, testLeafId } from "@effy/edge-shared/testing";

import { runMessagesPass, type MessagesDeps } from "./worker";

/**
 * 115 US3/US4 - automatic messages, against the real schema (T030, T033): once per occurrence over many runs, a new order
 * resets a win-back, a cart reminder resets only on an order, no backlog before `activated_at`, never-ordered customers
 * excluded, paused does nothing; repeats send at their time as their own message, wait for one still sending, finish.
 */
const RUN = process.env.CONTAINER_TESTS === "1";
const d = RUN ? describe : describe.skip;

let container: StartedPostgreSqlContainer;
let pool: Pool;
let transact: Transactor;
let n = 0;
let variant: { productId: string; variantId: string };

const DAY = 86_400_000;
const HOUR = 3_600_000;
/** 07:00 Melbourne (AEDT) on 2026-11-13 - a daily trigger's look. */
const T0 = new Date("2026-11-12T20:00:00Z");

function deps(now: Date): MessagesDeps {
  return {
    db: pool as Queryable, transact, now: () => now, deadline: Date.now() + 120_000,
    announceOps: async () => {}, announceInbox: async () => {},
  };
}

async function customer(opts: { orderedAt?: Date[]; yes?: boolean } = {}): Promise<{ id: string; sub: string }> {
  const sub = `au-${++n}`;
  const id = (await pool.query<{ id: string }>(
    `INSERT INTO public.customer (cognito_sub, email) VALUES ($1, ($1 || '@example.test')::citext) RETURNING id::text AS id`, [sub],
  )).rows[0]!.id;
  for (const at of opts.orderedAt ?? []) await order(id, at);
  if (opts.yes !== false) {
    await transact((tx) => applyPreferencesChange(tx, id, { surface: "web", via: "settings", consent: { offers: true, news: true }, wordingVersion: CONSENT_WORDING_VERSION }));
  }
  return { id, sub };
}

async function order(customerId: string, at: Date): Promise<string> {
  return (await pool.query<{ id: string }>(
    `INSERT INTO public."order" (customer_id, order_number, item_subtotal_amount, grand_total_amount, delivery_address, status, placed_at, created_at, delivery_type, delivery_type_reason)
     VALUES ($1, 'EFY-AU' || lpad($3::text, 5, '0'), 9, 11, '{}'::jsonb, 'paid', $2, $2, 'effy', 'in_coverage') RETURNING id::text AS id`,
    [customerId, at, ++n],
  )).rows[0]!.id;
}

async function cartLine(customerId: string, addedAt: Date): Promise<string> {
  let cart = (await pool.query<{ id: string }>(`SELECT id::text AS id FROM public.cart WHERE customer_id = $1`, [customerId])).rows[0]?.id;
  if (!cart) cart = (await pool.query<{ id: string }>(`INSERT INTO public.cart (customer_id) VALUES ($1) RETURNING id::text AS id`, [customerId])).rows[0]!.id;
  return (await pool.query<{ id: string }>(
    `INSERT INTO public.cart_item (cart_id, product_id, variant_id, quantity, added_at) VALUES ($1, $2, $3, 1, $4) RETURNING id::text AS id`,
    [cart, variant.productId, variant.variantId, addedAt],
  )).rows[0]!.id;
}

interface AutomationOpts {
  mode?: "trigger" | "repeat";
  kind?: string;
  audience?: string;
  filter?: object;
  triggerKind?: "not_ordered_days" | "cart_left_hours";
  triggerValue?: number;
  repeat?: { every: string; days?: number[] | null; date?: number | null; time: string; startsOn: string; endsOn?: string | null };
  activatedAt?: Date;
  nextRunAt?: Date | null;
  status?: string;
}

async function automation(o: AutomationOpts = {}): Promise<string> {
  const mode = o.mode ?? "trigger";
  const audience = o.audience ?? "customer";
  return (await pool.query<{ id: string }>(
    `INSERT INTO public.message_automation
       (name, kind, audience, filter, destination, title, body, mode, trigger_kind, trigger_value, repeat_every, repeat_days,
        repeat_date, repeat_time, starts_on, ends_on, status, next_run_at, activated_at, created_by)
     VALUES ('Auto ' || $1, $2, $3, $4::jsonb, $5::jsonb, 'From Effy', 'Hi {first name}, a note from Effy', $6, $7, $8, $9, $10::int[], $11,
             $12::time, $13::date, $14::date, $15, $16, $17, 'staff-1')
     RETURNING id::text AS id`,
    [
      ++n, o.kind ?? (mode === "trigger" ? "offer" : "announcement"), audience, JSON.stringify(o.filter ?? {}),
      JSON.stringify(audience === "customer" ? { kind: "home" } : { kind: "today" }), mode,
      mode === "trigger" ? (o.triggerKind ?? "not_ordered_days") : null, mode === "trigger" ? (o.triggerValue ?? 30) : null,
      o.repeat?.every ?? null, o.repeat?.days ?? null, o.repeat?.date ?? null, o.repeat?.time ?? null, o.repeat?.startsOn ?? null,
      o.repeat?.endsOn ?? null, o.status ?? "active", o.nextRunAt === undefined ? T0 : o.nextRunAt, o.activatedAt ?? new Date("2025-01-01T00:00:00Z"),
    ],
  )).rows[0]!.id;
}

/** Make an automation due at `now` (as the worker would have set it) and run one pass. */
async function runAt(automationId: string, now: Date): Promise<void> {
  await pool.query(`UPDATE public.message_automation SET next_run_at = $2 WHERE id = $1 AND status = 'active'`, [automationId, now]);
  await runMessagesPass(deps(now));
}

const reached = async (automationId: string, sub: string) =>
  Number((await pool.query(
    `SELECT count(*) AS c FROM public.notification n JOIN public.message m ON m.id = n.message_id WHERE m.automation_id = $1 AND n.recipient_sub = $2`,
    [automationId, sub],
  )).rows[0].c);
const runsOf = async (automationId: string) =>
  (await pool.query<{ outcome: string; matched: number; message_id: string | null }>(
    `SELECT outcome, matched, message_id::text AS message_id FROM public.message_automation_run WHERE automation_id = $1 ORDER BY ran_at, id`,
    [automationId],
  )).rows;
const automationRow = async (id: string) =>
  (await pool.query<{ status: string; next_run_at: Date | null }>(`SELECT status, next_run_at FROM public.message_automation WHERE id = $1`, [id])).rows[0]!;

d("115 - automatic messages", () => {
  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:16-alpine").start();
    pool = new Pool({ connectionString: container.getConnectionUri(), max: 8 });
    await pool.query(migrationSql());
    transact = transactorFor(pool);
    const shop = (await pool.query<{ id: string }>(`INSERT INTO public.shop (code, name) VALUES ('AUT', 'Shop') RETURNING id::text AS id`)).rows[0]!.id;
    variant = await insertTestProduct(pool, { shopId: shop, primaryCategoryId: await testLeafId(pool), name: "Milk", price: "4.50" });
  }, 300_000);

  beforeEach(async () => {
    // Earlier tests' automations must not run in this one's passes.
    await pool.query(`UPDATE public.message_automation SET status = 'finished', next_run_at = NULL WHERE status = 'active'`);
    await pool.query(`UPDATE public.message SET status = 'sent', sent_at = now() WHERE status IN ('scheduled', 'sending')`);
  });

  afterAll(async () => {
    await pool?.end();
    await container?.stop();
  });

  // ── triggers ──

  it("SC-004: seven daily runs reach a lapsed customer once; the next run time moves to 07:00 tomorrow", async () => {
    const lapsed = await customer({ orderedAt: [new Date(T0.getTime() - 40 * DAY)] });
    const recent = await customer({ orderedAt: [new Date(T0.getTime() - 5 * DAY)] });
    const id = await automation({ triggerValue: 30 });
    for (let i = 0; i < 7; i++) await runAt(id, new Date(T0.getTime() + i * DAY));
    expect(await reached(id, lapsed.sub)).toBe(1);
    expect(await reached(id, recent.sub)).toBe(0);
    const runs = await runsOf(id);
    expect(runs).toHaveLength(7);
    expect(runs.filter((r) => r.outcome === "sent_to_message")).toHaveLength(1);
    expect((await automationRow(id)).next_run_at?.toISOString()).toBe(new Date(T0.getTime() + 7 * DAY).toISOString());
  });

  it("a new order starts a new stretch: the win-back can reach them again 30 days after it", async () => {
    const c = await customer({ orderedAt: [new Date(T0.getTime() - 31 * DAY)] });
    const id = await automation({ triggerValue: 30 });
    await runAt(id, T0);
    await order(c.id, new Date(T0.getTime() + DAY));
    await runAt(id, new Date(T0.getTime() + 10 * DAY));
    expect(await reached(id, c.sub)).toBe(1);
    await runAt(id, new Date(T0.getTime() + 31 * DAY));
    expect(await reached(id, c.sub)).toBe(2);
  });

  it("never-ordered customers get no win-back", async () => {
    const never = await customer();
    const id = await automation({ triggerValue: 7 });
    await runAt(id, T0);
    expect(await reached(id, never.sub)).toBe(0);
  });

  it("no backlog: only moments at or after activated_at (a just-started or just-changed trigger)", async () => {
    const longAgo = await customer({ orderedAt: [new Date(T0.getTime() - 200 * DAY)] });
    const crossesToday = await customer({ orderedAt: [new Date(T0.getTime() - 30 * DAY + HOUR)] });
    const id = await automation({ triggerValue: 30, activatedAt: new Date(T0.getTime() - 2 * DAY) });
    await runAt(id, new Date(T0.getTime() + DAY));
    expect(await reached(id, longAgo.sub)).toBe(0);
    expect(await reached(id, crossesToday.sub)).toBe(1);
  });

  it("the cart reminder resets only on a new order - not on removing a line or refilling", async () => {
    const c = await customer({ orderedAt: [new Date(T0.getTime() - 20 * DAY)] });
    const line = await cartLine(c.id, new Date(T0.getTime() - 5 * HOUR));
    const id = await automation({ triggerKind: "cart_left_hours", triggerValue: 4 });
    await runAt(id, T0);
    expect(await reached(id, c.sub)).toBe(1);
    // Removing the line and adding another: the oldest line is new, but it is the same stretch.
    await pool.query(`DELETE FROM public.cart_item WHERE id = $1`, [line]);
    await cartLine(c.id, new Date(T0.getTime() + HOUR));
    await runAt(id, new Date(T0.getTime() + 6 * HOUR));
    expect(await reached(id, c.sub)).toBe(1);
    // An order, then a cart left again: a new occurrence.
    await order(c.id, new Date(T0.getTime() + 7 * HOUR));
    await pool.query(`DELETE FROM public.cart_item WHERE cart_id = (SELECT id FROM public.cart WHERE customer_id = $1)`, [c.id]);
    await cartLine(c.id, new Date(T0.getTime() + 8 * HOUR));
    await runAt(id, new Date(T0.getTime() + 13 * HOUR));
    expect(await reached(id, c.sub)).toBe(2);
  });

  it("the run's message is for exactly its people, within the automation's own filter", async () => {
    const inFilter = await customer({ orderedAt: [new Date(T0.getTime() - 40 * DAY)] });
    const outside = await customer({ orderedAt: [new Date(T0.getTime() - 40 * DAY)] });
    const id = await automation({ triggerValue: 30, filter: { people: [inFilter.id] } });
    await runAt(id, T0);
    expect(await reached(id, inFilter.sub)).toBe(1);
    expect(await reached(id, outside.sub)).toBe(0);
    const audience = (await pool.query<{ filter: Record<string, unknown> }>(
      `SELECT ma.filter FROM public.message_audience ma JOIN public.message m ON m.id = ma.message_id WHERE m.automation_id = $1`, [id],
    )).rows[0]!.filter;
    expect(audience).toMatchObject({ people: [inFilter.id], automationRun: expect.any(String) });
  });

  it("a paused automation does nothing", async () => {
    const c = await customer({ orderedAt: [new Date(T0.getTime() - 40 * DAY)] });
    const id = await automation({ triggerValue: 30, status: "paused", nextRunAt: null });
    await runMessagesPass(deps(T0));
    expect(await reached(id, c.sub)).toBe(0);
    expect(await runsOf(id)).toEqual([]);
  });

  // ── repeats ──

  it("a daily repeat sends at its time, each run its own message with its own report, and advances a day", async () => {
    const drv = (await pool.query<{ sub: string }>(
      `INSERT INTO public.driver (cognito_sub, name, work_email) VALUES ('rep-drv', 'Riley Driver', 'rep-drv@effyshopping.com') RETURNING cognito_sub AS sub`,
    )).rows[0]!.sub;
    const at9 = new Date("2026-11-12T22:00:00Z"); // 09:00 Melbourne, 13 Nov
    const id = await automation({ mode: "repeat", audience: "driver", repeat: { every: "day", time: "09:00", startsOn: "2026-11-13" }, nextRunAt: at9 });
    await runMessagesPass(deps(at9));
    await runMessagesPass(deps(new Date(at9.getTime() + 60_000)));
    expect((await automationRow(id)).next_run_at?.toISOString()).toBe(new Date(at9.getTime() + DAY).toISOString());
    await runMessagesPass(deps(new Date(at9.getTime() + DAY)));
    const runs = await runsOf(id);
    expect(runs.map((r) => r.outcome)).toEqual(["sent_to_message", "sent_to_message"]);
    expect(new Set(runs.map((r) => r.message_id)).size).toBe(2);
    expect(await reached(id, drv)).toBe(2);
  });

  it("a run waits while the previous run's message is still sending, then runs once (no doubling)", async () => {
    const at9 = new Date("2026-11-12T22:00:00Z");
    const id = await automation({ mode: "repeat", audience: "driver", repeat: { every: "day", time: "09:00", startsOn: "2026-11-13" }, nextRunAt: at9 });
    await runMessagesPass(deps(at9));
    const first = (await runsOf(id))[0]!.message_id!;
    await pool.query(`UPDATE public.message SET status = 'sending', sent_at = NULL WHERE id = $1`, [first]);
    const nextDay = new Date(at9.getTime() + DAY);
    await pool.query(`UPDATE public.message_automation SET next_run_at = $2 WHERE id = $1`, [id, nextDay]);
    // The worker would send it on; keep it "sending" by running only the automatic step's view of it.
    await pool.query(`UPDATE public.message SET cursor_audience = NULL WHERE id = $1`, [first]);
    const { runAutomations } = await import("./automations");
    await runAutomations({ db: pool, transact, now: () => nextDay });
    await runAutomations({ db: pool, transact, now: () => new Date(nextDay.getTime() + 60_000) });
    expect((await runsOf(id)).map((r) => r.outcome)).toEqual(["sent_to_message", "waited"]);
    expect((await automationRow(id)).next_run_at?.toISOString()).toBe(nextDay.toISOString());
    await pool.query(`UPDATE public.message SET status = 'sent', sent_at = now() WHERE id = $1`, [first]);
    const late = new Date(nextDay.getTime() + 2 * HOUR);
    await runAutomations({ db: pool, transact, now: () => late });
    expect((await runsOf(id)).map((r) => r.outcome)).toEqual(["sent_to_message", "waited", "sent_to_message"]);
    // The next run is the first due time after now: tomorrow at 09:00, not a second one today.
    expect((await automationRow(id)).next_run_at?.toISOString()).toBe(new Date(nextDay.getTime() + DAY).toISOString());
  });

  it("a schedule past its end finishes, with its log saying so", async () => {
    const at9 = new Date("2026-11-12T22:00:00Z");
    const id = await automation({
      mode: "repeat", audience: "driver", repeat: { every: "day", time: "09:00", startsOn: "2026-11-13", endsOn: "2026-11-13" }, nextRunAt: at9,
    });
    await runMessagesPass(deps(at9));
    expect(await automationRow(id)).toEqual({ status: "finished", next_run_at: null });
    const log = (await pool.query(`SELECT kind, actor_sub FROM public.message_automation_event WHERE automation_id = $1`, [id])).rows;
    expect(log).toEqual([{ kind: "finished", actor_sub: "system" }]);
  });
});
