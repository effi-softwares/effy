import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import type { AudienceFilter, NotificationAudience } from "@effy/shared-types";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { transactorFor, type Transactor } from "../../lib/db";
import { credit } from "../../points/ledger";
import { LISTED_POSTCODE_FIXTURE_SQL, migrationSql } from "../../testing/migrations";
import { applyPreferencesChange, CONSENT_WORDING_VERSION } from "../preferences";
import { AudienceInvalid, countAudience, parseAudience, personSub, recipientsSql, resolveCustomerEmails } from "./audience";

/**
 * 112 R4 - every audience filter against a hand-written answer: who matches, who doesn't, paging covers everyone once,
 * and "said yes" is counted from the same people.
 */
const RUN = process.env.CONTAINER_TESTS === "1";
const d = RUN ? describe : describe.skip;

let container: StartedPostgreSqlContainer;
let pool: Pool;
let transact: Transactor;
let n = 0;
const ZONE = "aaaaaaaa-0000-4000-8000-000000000001";
const OTHER_ZONE = "aaaaaaaa-0000-4000-8000-000000000002";

const one = async <T>(sql: string, values: unknown[] = []) => (await pool.query(sql, values)).rows[0] as T;

async function customer(opts: { postcode?: string; status?: string; closing?: boolean } = {}): Promise<{ id: string; sub: string; email: string }> {
  const sub = `cust-${++n}`;
  const email = `${sub}@example.test`;
  const { id } = await one<{ id: string }>(
    `INSERT INTO public.customer (cognito_sub, email, status, closure_state) VALUES ($1, $2::citext, $3, $4) RETURNING id::text AS id`,
    [sub, email, opts.status ?? "active", opts.closing ? "closing" : "open"],
  );
  if (opts.postcode) {
    await pool.query(
      `INSERT INTO public.customer_address (customer_id, recipient_name, line1, city, postal_code, country, is_default)
       VALUES ($1, 'Test', '1 Test St', 'Melbourne', $2, 'AU', true)`,
      [id, opts.postcode],
    );
  }
  return { id, sub, email };
}

async function paidOrder(customerId: string, daysAgo: number): Promise<void> {
  await pool.query(
    `INSERT INTO public."order" (customer_id, order_number, item_subtotal_amount, grand_total_amount, delivery_address, status, placed_at, delivery_type, delivery_type_reason)
     VALUES ($1, 'EFY-' || substr(gen_random_uuid()::text, 1, 8), 10, 12, '{}'::jsonb, 'paid', now() - make_interval(days => $2), 'effy', 'in_coverage')`,
    [customerId, daysAgo],
  );
}

async function driver(status = "active"): Promise<{ id: string; sub: string }> {
  const sub = `drv-${++n}`;
  const { id } = await one<{ id: string }>(
    `INSERT INTO public.driver (cognito_sub, name, work_email, status) VALUES ($1, 'Driver', ($1 || '@effyshopping.com')::citext, $2) RETURNING id::text AS id`,
    [sub, status],
  );
  return { id, sub };
}

async function roundToday(driverId: string, kind: "collection" | "delivery", status = "planned"): Promise<void> {
  const { id: wave } = await one<{ id: string }>(`INSERT INTO public.dispatch_wave (kind, planned_for, trigger) VALUES ($1, now(), 'schedule') RETURNING id`, [kind]);
  await pool.query(`INSERT INTO public.driver_round (wave_id, driver_id, kind, status, deadline_at) VALUES ($1, $2, $3, $4, now())`, [wave, driverId, kind, status]);
}

async function shop(status = "active"): Promise<string> {
  return (await one<{ id: string }>(
    `INSERT INTO public.shop (code, name, status) VALUES ($1, 'Shop', $2) RETURNING id::text AS id`,
    [`S${++n}`, status],
  )).id;
}

async function staff(shopId: string, opts: { manager?: boolean; status?: string } = {}): Promise<{ id: string; sub: string }> {
  const sub = `staff-${++n}`;
  const { id } = await one<{ id: string }>(
    `INSERT INTO public.shop_staff (cognito_sub, email, name, status, shop_id) VALUES ($1, $1 || '@example.test', 'Staff', $2, $3) RETURNING id::text AS id`,
    [sub, opts.status ?? "active", shopId],
  );
  if (opts.manager) await pool.query(`INSERT INTO public.shop_staff_role (staff_id, role_key) VALUES ($1, 'shop_manager')`, [id]);
  return { id, sub };
}

/** Everyone the worker would page through, 2 at a time, so paging is exercised. */
async function everyone(audience: NotificationAudience, filter: AudienceFilter): Promise<string[]> {
  const out: string[] = [];
  let after: string | null = null;
  for (;;) {
    const q = recipientsSql(audience, filter, { afterSub: after, limit: 2 });
    const rows = (await pool.query<{ sub: string }>(q.text, q.values)).rows;
    if (rows.length === 0) return out;
    out.push(...rows.map((r) => r.sub));
    after = rows[rows.length - 1]!.sub;
  }
}

/** Only the people this test made (other tests' people share the database). */
const among = (subs: string[], mine: { sub: string }[]) => subs.filter((s) => mine.some((m) => m.sub === s)).sort();
const subsOf = (xs: { sub: string }[]) => xs.map((x) => x.sub).sort();

d("message audiences (112 R4)", () => {
  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:16-alpine").start();
    pool = new Pool({ connectionString: container.getConnectionUri() });
    await pool.query(migrationSql());
    transact = transactorFor(pool);
    await pool.query(
      `INSERT INTO public.delivery_zone (id, code, name, updated_by) VALUES ($1, 'T-A', 'Group A', 'test'), ($2, 'T-B', 'Group B', 'test')`,
      [ZONE, OTHER_ZONE],
    );
    await pool.query(LISTED_POSTCODE_FIXTURE_SQL, [ZONE, "3101"]);
    await pool.query(LISTED_POSTCODE_FIXTURE_SQL, [OTHER_ZONE, "3205"]);
  }, 120_000);

  afterAll(async () => {
    await pool?.end();
    await container?.stop();
  });

  describe("customers", () => {
    it("everyone: active, open accounts only", async () => {
      const ok = await customer();
      const barred = await customer({ status: "barred" });
      const closing = await customer({ closing: true });
      const subs = await everyone("customer", {});
      expect(among(subs, [ok, barred, closing])).toEqual([ok.sub]);
    });

    it("chosen people, postcodes and coverage groups", async () => {
      const a = await customer({ postcode: "3101" });
      const b = await customer({ postcode: "3205" });
      const c = await customer();
      const mine = [a, b, c];
      expect(among(await everyone("customer", { people: [a.id, c.id] }), mine)).toEqual(subsOf([a, c]));
      expect(among(await everyone("customer", { postcodes: ["3205"] }), mine)).toEqual([b.sub]);
      expect(among(await everyone("customer", { groups: [ZONE] }), mine)).toEqual([a.sub]);
      // AND: in group A and chosen as b → nobody.
      expect(among(await everyone("customer", { groups: [ZONE], people: [b.id] }), mine)).toEqual([]);
    });

    it("ordered in the last N days, never ordered", async () => {
      const recent = await customer();
      const old = await customer();
      const never = await customer();
      await paidOrder(recent.id, 3);
      await paidOrder(old.id, 60);
      const mine = [recent, old, never];
      expect(among(await everyone("customer", { orderedWithinDays: 30 }), mine)).toEqual([recent.sub]);
      expect(among(await everyone("customer", { neverOrdered: true }), mine)).toEqual([never.sub]);
    });

    it("has points, uses the app", async () => {
      const rich = await customer();
      const app = await customer();
      const plain = await customer();
      await transact((tx) => credit(tx, { customerId: rich.id, points: 100, kind: "staff_credit", reason: "goodwill", author: { kind: "staff", sub: "s" }, now: new Date(), quiet: true }));
      await pool.query(`INSERT INTO public.device_token (subject_sub, audience, platform, fcm_token) VALUES ($1, 'customer', 'android', $2)`, [app.sub, `tok-${app.sub}`]);
      const mine = [rich, app, plain];
      expect(among(await everyone("customer", { hasPoints: true }), mine)).toEqual([rich.sub]);
      expect(among(await everyone("customer", { appUsers: true }), mine)).toEqual([app.sub]);
    });

    it("counts match and said yes from the same people", async () => {
      const yes = await customer({ postcode: "3101" });
      const no = await customer({ postcode: "3101" });
      const never = await customer({ postcode: "3101" });
      await transact((tx) => applyPreferencesChange(tx, yes.id, { surface: "web", via: "settings", consent: { offers: true }, wordingVersion: CONSENT_WORDING_VERSION }));
      await transact((tx) => applyPreferencesChange(tx, no.id, { surface: "web", via: "settings", consent: { offers: false }, wordingVersion: CONSENT_WORDING_VERSION }));
      const filter = { people: [yes.id, no.id, never.id] };
      expect(await countAudience(pool, "customer", filter, "offers")).toEqual({ matched: 3, consented: 1 });
      expect(await countAudience(pool, "customer", filter, "news")).toEqual({ matched: 3, consented: 0 });
      expect(await countAudience(pool, "customer", filter, null)).toEqual({ matched: 3, consented: null });
    });

    it("resolves a file of emails to ids, counting the unknown and the repeated", async () => {
      const a = await customer();
      const b = await customer();
      const r = await resolveCustomerEmails(pool, [a.email.toUpperCase(), b.email, ` ${a.email} `, "nobody@example.test", ""]);
      expect(r.ids.sort()).toEqual([a.id, b.id].sort());
      expect(r.notFound).toBe(1);
      expect(r.repeated).toBe(1);
    });
  });

  describe("drivers", () => {
    it("everyone active; on duty; work today by kind; clearance; chosen", async () => {
      const onDuty = await driver();
      const collector = await driver();
      const deliverer = await driver();
      const cleared = await driver();
      const everywhere = await driver();
      const suspended = await driver("suspended");
      await pool.query(`INSERT INTO public.driver_duty_session (driver_id) VALUES ($1)`, [onDuty.id]);
      await roundToday(collector.id, "collection");
      await roundToday(deliverer.id, "delivery");
      await roundToday(onDuty.id, "delivery", "completed"); // done: not "work today"
      await pool.query(`INSERT INTO public.driver_zone_capability (driver_id, function, zone_id) VALUES ($1, 'delivery', $2)`, [cleared.id, ZONE]);
      await pool.query(`INSERT INTO public.driver_zone_capability (driver_id, function, zone_id) VALUES ($1, 'delivery', NULL)`, [everywhere.id]);
      const mine = [onDuty, collector, deliverer, cleared, everywhere, suspended];

      expect(among(await everyone("driver", {}), mine)).toEqual(subsOf([onDuty, collector, deliverer, cleared, everywhere]));
      expect(among(await everyone("driver", { onDuty: true }), mine)).toEqual([onDuty.sub]);
      expect(among(await everyone("driver", { workToday: true }), mine)).toEqual(subsOf([collector, deliverer]));
      expect(among(await everyone("driver", { collectionToday: true }), mine)).toEqual([collector.sub]);
      expect(among(await everyone("driver", { deliveryToday: true }), mine)).toEqual([deliverer.sub]);
      expect(among(await everyone("driver", { clearance: { function: "delivery", zoneId: ZONE } }), mine)).toEqual(subsOf([cleared, everywhere]));
      expect(among(await everyone("driver", { clearance: { function: "delivery", zoneId: null } }), mine)).toEqual([everywhere.sub]);
      expect(among(await everyone("driver", { clearance: { function: "collection", zoneId: ZONE } }), mine)).toEqual([]);
      expect(among(await everyone("driver", { people: [suspended.id, cleared.id] }), mine)).toEqual([cleared.sub]);
    });
  });

  describe("shops", () => {
    it("active staff of active shops; chosen shops; managers only", async () => {
      const s1 = await shop();
      const s2 = await shop();
      const closed = await shop("disabled");
      const m1 = await staff(s1, { manager: true });
      const st1 = await staff(s1);
      const off = await staff(s1, { status: "disabled" });
      const st2 = await staff(s2);
      const gone = await staff(closed);
      const mine = [m1, st1, off, st2, gone];
      expect(among(await everyone("shop", {}), mine)).toEqual(subsOf([m1, st1, st2]));
      expect(among(await everyone("shop", { shops: [s1] }), mine)).toEqual(subsOf([m1, st1]));
      expect(among(await everyone("shop", { shops: [s1, s2], managersOnly: true }), mine)).toEqual([m1.sub]);
      expect(await personSub(pool, "shop", st2.id)).toBe(st2.sub);
      expect(await personSub(pool, "shop", gone.id)).toBeNull();
    });
  });

  it("finds one person by the id staff know them by, or null when they can't be reached", async () => {
    const c = await customer();
    const barred = await customer({ status: "barred" });
    const drv = await driver();
    expect(await personSub(pool, "customer", c.id)).toBe(c.sub);
    expect(await personSub(pool, "customer", barred.id)).toBeNull();
    expect(await personSub(pool, "driver", drv.id)).toBe(drv.sub);
    expect(await personSub(pool, "driver", "not-an-id")).toBeNull();
  });

  it("refuses an unknown filter or a bad value", () => {
    expect(() => parseAudience("customer", { everyone: true })).toThrow(AudienceInvalid);
    expect(() => parseAudience("customer", { postcodes: ["31O1"] })).toThrow(AudienceInvalid);
    expect(() => parseAudience("customer", { orderedWithinDays: 0 })).toThrow(AudienceInvalid);
    expect(() => parseAudience("customer", { neverOrdered: true, orderedWithinDays: 5 })).toThrow(AudienceInvalid);
    expect(() => parseAudience("driver", { onDuty: false })).toThrow(AudienceInvalid);
    expect(() => parseAudience("driver", { clearance: { function: "flying", zoneId: null } })).toThrow(AudienceInvalid);
    expect(() => parseAudience("shop", { managersOnly: true, people: [] })).toThrow(AudienceInvalid);
    expect(parseAudience("shop", { managersOnly: true })).toEqual({ managersOnly: true });
    expect(parseAudience("customer", {})).toEqual({});
  });
});
