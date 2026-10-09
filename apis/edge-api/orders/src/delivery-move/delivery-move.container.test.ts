import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 081 — back-office's move of an order between Effy and courier delivery, through its two routes,
 * against the REAL schema: who may move (P8), what is refused and how it is said (P6, P7), what
 * happens after the commit (the screens, the drivers, a refund sent), and the order page's history.
 *
 * The behaviour of the move itself is proved in `@effy/edge-shared/delivery` override.container.test.ts;
 * this is the route around it. ⚠ The courier service is fictional; real ones are the operator's to enter.
 */
const holder = vi.hoisted(() => ({
  pool: null as Pool | null,
  roles: new Map<string, string>(),
  announced: [] as string[],
  dispatched: [] as string[][],
  submitted: [] as string[],
}));

vi.mock("@effy/edge-shared", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("@effy/edge-shared");
  return {
    ...actual,
    query: (text: string, params?: unknown[]) => holder.pool!.query(text, params as never[]),
    pooled: { query: (text: string, params?: unknown[]) => holder.pool!.query(text, params as never[]) },
    withTransaction: (fn: (tx: unknown) => Promise<unknown>) =>
      (actual.transactorFor as (p: Pool) => (f: typeof fn) => Promise<unknown>)(holder.pool!)(fn),
    proposedRefunds: async () => [],
    // The staff record decides; here it is a map. Write = admin|manager, read = any active.
    isActiveStaff: async (sub: string) => holder.roles.has(sub),
    hasStaffRole: async (sub: string, roles: readonly string[]) => roles.includes(holder.roles.get(sub) ?? ""),
  };
});
vi.mock("@effy/edge-shared/live", () => ({
  announceOrder: async (id: string) => void holder.announced.push(id),
  announceDispatch: async (ids: string[]) => void holder.dispatched.push(ids),
  announceSlots: async () => undefined,
}));
vi.mock("../lib/money", () => ({
  refundService: { submitRecorded: async (id: string) => { holder.submitted.push(id); return { status: "submitted" }; } },
}));

import { migrationSql } from "@effy/edge-shared";

import { handler as getMove } from "../functions/order-delivery-move-v1-get";
import { handler as postMove } from "../functions/order-delivery-move-v1-post";
import { getOrder } from "../orders/service";

const RUN = process.env.CONTAINER_TESTS === "1";
const d = RUN ? describe : describe.skip;

let container: StartedPostgreSqlContainer;
let pool: Pool;
let shop: string;
let n = 0;

const one = async <T>(sql: string, args: unknown[] = []) => (await pool.query(sql, args)).rows[0] as T;

/** A paid Effy order, $9.00 delivery, in a later-day window (no clock games: tomorrow is always open). */
async function effyOrder() {
  n += 1;
  const tag = `dm-${n}`;
  const customer = (await one<{ id: string }>(`INSERT INTO public.customer (cognito_sub, email) VALUES ($1, $2) RETURNING id::text AS id`, [tag, `${tag}@example.test`])).id;
  const order = (await one<{ id: string }>(
    `INSERT INTO public."order" (order_number, customer_id, status, item_subtotal_amount, delivery_fee_amount, grand_total_amount, currency,
                                 delivery_address, delivery_fee_breakdown, delivery_type, delivery_type_reason, placed_at)
     VALUES ($1, $2, 'paid', 40, 9, 49, 'AUD', '{"postalCode":"3121"}'::jsonb, '{"inputs":{"grams":2000,"basketCents":4000}}'::jsonb, 'effy', 'in_coverage', now())
     RETURNING id::text AS id`,
    [`EFY-${tag}`, customer],
  )).id;
  await pool.query(
    `INSERT INTO public.payment (order_id, provider, stripe_payment_intent_id, amount, currency, status) VALUES ($1, 'stripe', $2, 49, 'AUD', 'succeeded')`,
    [order, `pi_${tag}`],
  );
  await pool.query(
    `INSERT INTO public.shop_fulfillment (order_id, shop_id, item_count, subtotal_amount, status, delivery_method) VALUES ($1, $2, 1, 40, 'ready_for_pickup', 'standard')`,
    [order, shop],
  );
  await pool.query(`INSERT INTO public.order_package_delivery (order_id, shop_id, method) VALUES ($1, $2, 'standard')`, [order, shop]);
  return { order, customer };
}

function event(sub: string, method: "GET" | "POST", orderId: string, opts: { query?: Record<string, string>; body?: unknown } = {}) {
  return {
    rawPath: `/orders/v1/orders/${orderId}/delivery-move`,
    pathParameters: { orderId },
    queryStringParameters: opts.query,
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    requestContext: { requestId: `req-${Math.random()}`, http: { method }, authorizer: { jwt: { claims: { sub } } } },
  } as never;
}
const ctx = { awsRequestId: "test", callbackWaitsForEmptyEventLoop: true } as never;
const call = async (fn: typeof getMove, e: unknown) => {
  const res = await fn(e as never, ctx);
  return { status: res.statusCode, body: JSON.parse(res.body ?? "{}") };
};
const preview = (sub: string, order: string, to = "courier") => call(getMove, event(sub, "GET", order, { query: { to } }));
const move = (sub: string, order: string, body: unknown) => call(postMove, event(sub, "POST", order, { body }));

d("081 — the delivery-move routes", () => {
  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:16-alpine").start();
    pool = new Pool({ connectionString: container.getConnectionUri() });
    holder.pool = pool;
    await pool.query(migrationSql());
    holder.roles.set("sub-manager", "manager");
    holder.roles.set("sub-csa", "csa");
    shop = (await one<{ id: string }>(`INSERT INTO public.shop (code, name) VALUES ('DM', 'Shop') RETURNING id::text AS id`)).id;
    await pool.query(`
      INSERT INTO public.delivery_settings (id, hub_latitude, hub_longitude, updated_by) VALUES (1, -37.81, 144.96, 'test')
        ON CONFLICT (id) DO UPDATE SET hub_latitude = EXCLUDED.hub_latitude;
      INSERT INTO public.delivery_fee_plan (id, kind, name, is_active, base_amount, rounding_step, floor_amount, cap_amount, created_by)
        VALUES ('00000000-0000-0000-0000-0000000081d0', 'courier', 'Courier table', true, 6.50, 0.50, 0.00, 90.00, 'test');
      INSERT INTO public.delivery_weight_band (plan_id, upper_grams, add_amount) VALUES ('00000000-0000-0000-0000-0000000081d0', 100000, 0.00);
      INSERT INTO public.courier_service (courier_name, service_name, estimate_text, max_business_days, pickup_weekdays, pickup_cutoff, is_default, updated_by)
        VALUES ('Test Courier', 'Parcel', '2–4 business days', 4, '{1,2,3,4,5}', '14:00', true, 'test');`);
  }, 240_000);

  afterAll(async () => {
    await pool?.end();
    await container?.stop();
  });

  beforeEach(() => {
    holder.announced = [];
    holder.dispatched = [];
    holder.submitted = [];
  });

  it("P8 — a customer-service agent previews and reads the history, and cannot move", async () => {
    const o = await effyOrder();
    const p = await preview("sub-csa", o.order);
    expect(p.status).toBe(200);
    expect(p.body).toMatchObject({ allowed: true, differenceAmount: "2.50" });
    const refused = await move("sub-csa", o.order, {
      to: "courier", reason: "x", compensation: "points_difference", expectedUpdatedAt: p.body.updatedAt, expectedAmount: "2.50",
    });
    expect(refused.status).toBe(403);
    expect((await one<{ t: string }>(`SELECT delivery_type AS t FROM public."order" WHERE id = $1`, [o.order])).t).toBe("effy");
    // Nobody signed in at all.
    expect((await preview("", o.order)).status).toBe(401);
  });

  it("a manager moves it: the move comes back recorded, and the screens and drivers are told after the commit", async () => {
    const o = await effyOrder();
    const p = await preview("sub-manager", o.order);
    const res = await move("sub-manager", o.order, {
      to: "courier", reason: "Van off the road", compensation: "points_difference", expectedUpdatedAt: p.body.updatedAt, expectedAmount: "2.50",
    });
    expect(res.status).toBe(200);
    expect(res.body.move).toMatchObject({ to: "courier", reason: "Van off the road", compensation: "points_difference", amount: "2.50", points: 250 });
    expect(res.body.refund).toBeUndefined();
    expect(holder.announced).toEqual([o.order]);
    expect(holder.dispatched).toEqual([[]]);
    // The order page carries the history, for every role.
    const detail = await getOrder(o.order);
    expect(detail?.deliveryMoves).toEqual([expect.objectContaining({ to: "courier", actor: expect.objectContaining({ sub: "sub-manager" }) })]);
  });

  it("P6/P7 — the request is checked field by field; a stale amount, a stale order and a repeat are refused with their codes", async () => {
    const o = await effyOrder();
    const p = await preview("sub-manager", o.order);
    const base = { to: "courier", reason: "Van off the road", compensation: "points_difference", expectedUpdatedAt: p.body.updatedAt, expectedAmount: "2.50" };

    const noReason = await move("sub-manager", o.order, { ...base, reason: "  " });
    expect(noReason.status).toBe(400);
    expect(noReason.body.fields.map((f: { field: string }) => f.field)).toEqual(["reason"]);
    const noNote = await move("sub-manager", o.order, { ...base, compensation: "none", expectedAmount: "0.00" });
    expect(noNote.body.fields.map((f: { field: string }) => f.field)).toEqual(["compensationNote"]);
    expect((await move("sub-manager", o.order, { ...base, compensation: "free" })).status).toBe(400);
    expect((await preview("sub-manager", o.order, "sideways")).status).toBe(400);

    const stale = await move("sub-manager", o.order, { ...base, expectedAmount: "3.00" });
    expect(stale.status).toBe(409);
    expect(stale.body).toMatchObject({ code: "compensation_changed", preview: { differenceAmount: "2.50" } });
    expect((await move("sub-manager", o.order, { ...base, expectedUpdatedAt: "2020-01-01T00:00:00Z" })).body.code).toBe("changed");

    expect((await move("sub-manager", o.order, base)).status).toBe(200);
    const again = await move("sub-manager", o.order, base);
    expect(again).toMatchObject({ status: 409, body: { code: "already_courier" } });
    expect(Number((await one<{ n: string }>(`SELECT count(*) AS n FROM public.points_entry WHERE customer_id = $1`, [o.customer])).n)).toBe(1);

    expect((await preview("sub-manager", "00000000-0000-0000-0000-000000000000")).status).toBe(404);
  });

  it("a refund compensation is recorded in the move and sent after it", async () => {
    const o = await effyOrder();
    const p = await preview("sub-manager", o.order);
    const res = await move("sub-manager", o.order, {
      to: "courier", reason: "Van off the road", compensation: "refund_difference", expectedUpdatedAt: p.body.updatedAt, expectedAmount: "2.50",
    });
    expect(res.status).toBe(200);
    const refund = await one<{ id: string; kind: string }>(`SELECT id::text AS id, kind FROM public.refund WHERE order_id = $1`, [o.order]);
    expect(refund.kind).toBe("delivery");
    expect(holder.submitted).toEqual([refund.id]);
    expect(res.body.refund).toEqual({ status: "submitted" });
  });
});
