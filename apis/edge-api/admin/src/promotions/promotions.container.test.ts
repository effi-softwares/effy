import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const holder = vi.hoisted(() => ({ pool: null as Pool | null, announced: [] as unknown[] }));

vi.mock("@effy/edge-shared", async (importOriginal) => {
  const query = (text: string, params?: unknown[]) => holder.pool!.query(text, params as never[]);
  return {
    ...(await importOriginal<typeof import("@effy/edge-shared")>()),
    query,
    pooled: { query },
    withTransaction: async (fn: (c: unknown) => unknown) => {
      const client = await holder.pool!.connect();
      try {
        await client.query("BEGIN");
        const out = await fn(client);
        await client.query("COMMIT");
        return out;
      } catch (e) {
        await client.query("ROLLBACK");
        throw e;
      } finally {
        client.release();
      }
    },
  };
});
vi.mock("@effy/edge-shared/live", () => ({
  announce: async (changes: unknown[]) => {
    holder.announced.push(...changes);
  },
}));
import { migrationSql } from "@effy/edge-shared/testing";

import * as groups from "../promotion-groups/service";
import * as extras from "./promotion-extras";
import * as svc from "./promotion-service";
import { isPromoError } from "./types";

/** Against the real schema: lifecycle, state counts, the used-promotion refusal, audit and announce. */
const RUN = process.env.CONTAINER_TESTS === "1";
const d = RUN ? describe : describe.skip;
const SUB = "manager-sub";

let container: StartedPostgreSqlContainer;
let pool: Pool;

async function codeOf(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return "no-throw";
  } catch (e) {
    return isPromoError(e) ? e.code : `other: ${(e as Error).message}`;
  }
}

const CART_CODE = { name: "Spring", kind: "cart", trigger: "code", valueType: "percent", percentOff: 20, maxDiscount: "15.00", minSubtotal: "40.00", sharedCode: "spring 20" };

d("094 - back-office promotions", () => {
  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:16-alpine").start();
    pool = new Pool({ connectionString: container.getConnectionUri(), max: 6 });
    holder.pool = pool;
    await pool.query(migrationSql());
  }, 240_000);

  afterAll(async () => {
    await pool?.end();
    await container?.stop();
  });

  it("creates a draft with its code normalised, reads it back in words, and audits and announces it", async () => {
    const p = await svc.createPromotion(CART_CODE, SUB);
    expect(p).toMatchObject({ state: "draft", sharedCode: "SPRING20", gives: "20% off your order, up to $15", terms: "On orders over $40.00", used: false });
    const audit = await pool.query<{ action: string; actor_sub: string }>(
      `SELECT action, actor_sub FROM admin.audit_log WHERE target_type = 'promotion' AND target_id = $1`,
      [p.id],
    );
    expect(audit.rows[0]).toMatchObject({ action: "promotion.created", actor_sub: SUB });
    expect(holder.announced).toContainEqual({ scope: "ops", kind: "promotions" });
  });

  it("refuses an ill-formed promotion field by field", async () => {
    const err = await svc.createPromotion({ name: "", kind: "cart", trigger: "code", valueType: "percent", percentOff: 120 }, SUB).catch((e) => e);
    expect(isPromoError(err) && err.fields.map((f) => f.field)).toEqual(["name", "percentOff", "sharedCode"]);
    expect(await codeOf(svc.createPromotion({ ...CART_CODE, name: "Dup" }, SUB))).toBe("code_taken");
  });

  it("walks the lifecycle, and only the moves that make sense are allowed", async () => {
    const p = await svc.createPromotion({ name: "Weekend", kind: "cart", trigger: "automatic", valueType: "amount", amountOff: "5.00" }, SUB);
    expect(await codeOf(svc.actOn(p.id, "pause", SUB))).toBe("action_not_allowed");
    expect((await svc.actOn(p.id, "publish", SUB)).state).toBe("active");
    expect((await svc.actOn(p.id, "pause", SUB)).state).toBe("paused");
    expect((await svc.actOn(p.id, "resume", SUB)).state).toBe("active");
    expect((await svc.actOn(p.id, "end", SUB)).state).toBe("ended");
    expect((await svc.actOn(p.id, "archive", SUB)).state).toBe("archived");
    const list = await svc.listPromotions({ q: "Weekend" });
    expect(list.items.map((i) => i.state)).toEqual(["archived"]);
    expect(list.counts.archived).toBe(1);
  });

  it("once used, what it gives and who it is for are fixed - but its dates and words are not", async () => {
    const p = await svc.createPromotion({ name: "Used", kind: "cart", trigger: "automatic", valueType: "amount", amountOff: "5.00", publish: true }, SUB);
    const cust = (await pool.query<{ id: string }>(`INSERT INTO public.customer (cognito_sub, email) VALUES ('u1', 'u1@example.test') RETURNING id::text AS id`)).rows[0]!.id;
    const order = (await pool.query<{ id: string }>(
      `INSERT INTO public."order" (customer_id, order_number, status, currency, item_subtotal_amount, grand_total_amount, delivery_fee_amount, delivery_address, delivery_type, delivery_type_reason)
       VALUES ($1, 'EFY-U1', 'paid', 'AUD', 40, 35, 0, '{}'::jsonb, 'effy', 'in_coverage') RETURNING id::text AS id`, [cust],
    )).rows[0]!.id;
    await pool.query(`INSERT INTO public.promotion_use (promotion_id, customer_id, order_id, goods_amount, status, confirmed_at) VALUES ($1, $2, $3, 5, 'confirmed', now())`, [p.id, cust, order]);

    expect(await codeOf(svc.updatePromotion(p.id, { amountOff: "9.00" }, SUB))).toBe("promotion_used");
    expect(await codeOf(svc.deletePromotion(p.id, SUB))).toBe("promotion_used");
    const edited = await svc.updatePromotion(p.id, { headline: "Still on", endsAt: new Date(Date.now() + 86_400_000).toISOString() }, SUB);
    expect(edited).toMatchObject({ headline: "Still on", used: true, uses: 1, given: "5.00" });
  });

  it("refuses a stale edit", async () => {
    const p = await svc.createPromotion({ name: "Stale", kind: "cart", trigger: "automatic", valueType: "amount", amountOff: "5.00" }, SUB);
    expect(await codeOf(svc.updatePromotion(p.id, { name: "Mine", expectedUpdatedAt: "2020-01-01T00:00:00.000Z" }, SUB))).toBe("stale");
    await svc.updatePromotion(p.id, { name: "Mine", expectedUpdatedAt: p.updatedAt }, SUB);
  });

  it("puts a promotion in groups - and needs a headline to", async () => {
    const g = (await pool.query<{ id: string }>(`SELECT id::text FROM public.promotion_group WHERE key = 'offers'`)).rows[0]!.id;
    const body = { name: "Grouped", kind: "cart", trigger: "automatic", valueType: "amount", amountOff: "3.00", groupIds: [g] };
    expect(await codeOf(svc.createPromotion(body, SUB))).toBe("validation_failed");
    const p = await svc.createPromotion({ ...body, headline: "$3 off" }, SUB);
    expect(p.groups.map((x) => x.key)).toEqual(["offers"]);
  });

  it("groups: created by key, ordered, previewed with why each hidden one is hidden, and the key never changes", async () => {
    const g = await groups.createGroup({ key: "summer-strip", name: "Summer strip" }, SUB);
    expect(await codeOf(groups.createGroup({ key: "summer-strip", name: "Again" }, SUB))).toBe("key_taken");
    expect(await codeOf(groups.updateGroup(g.id, { key: "other" }, SUB))).toBe("group_key_fixed");
    const live = await svc.createPromotion({ name: "Live", kind: "cart", trigger: "automatic", valueType: "amount", amountOff: "2.00", headline: "$2 off", publish: true }, SUB);
    const draft = await svc.createPromotion({ name: "Draft", kind: "cart", trigger: "automatic", valueType: "amount", amountOff: "2.00", headline: "Soon" }, SUB);
    const mine = await svc.createPromotion({ name: "Mine", kind: "cart", trigger: "automatic", valueType: "amount", amountOff: "2.00", headline: "Welcome", audience: "first_order", publish: true }, SUB);
    const detail = await groups.putMembers(g.id, { members: [{ promotionId: draft.id }, { promotionId: live.id }, { promotionId: mine.id }] }, SUB);
    expect(detail.members.map((m) => m.name)).toEqual(["Draft", "Live", "Mine"]);
    const preview = await groups.previewGroup(g.id);
    expect(preview.shown.map((x) => x.headline)).toEqual(["$2 off"]);
    expect(preview.hidden).toEqual([
      { promotionId: draft.id, name: "Draft", why: "draft" },
      { promotionId: mine.id, name: "Mine", why: "personal" },
    ]);
    await groups.deleteGroup(g.id, SUB);
    expect((await svc.readPromotion(live.id)).groups).toEqual([]);
  });

  it("chosen customers by email (unknown ones listed back), single-use codes in a batch, and performance", async () => {
    const chosen = await svc.createPromotion({ name: "VIP", kind: "cart", trigger: "automatic", valueType: "amount", amountOff: "5.00", audience: "chosen", publish: true }, SUB);
    await pool.query(`INSERT INTO public.customer (cognito_sub, email) VALUES ('vip1', 'vip1@example.test')`);
    const added = await extras.addCustomers(chosen.id, { emails: ["VIP1@example.test", "nobody@example.test"] }, SUB);
    expect(added).toEqual({ added: 1, unknownEmails: ["nobody@example.test"] });
    expect((await extras.listCustomers(chosen.id, {})).items.map((c) => c.email)).toEqual(["vip1@example.test"]);

    const coded = await svc.createPromotion({ name: "Batch", kind: "cart", trigger: "code", valueType: "amount", amountOff: "5.00", sharedCode: "BATCHSHARED", publish: true }, SUB);
    const batch = await extras.generateCodes(coded.id, { count: 25, prefix: "TEN" }, SUB);
    expect(batch.created).toBe(25);
    const codes = await extras.listCodes(coded.id, {});
    expect(codes.total).toBe(25);
    expect(codes.items.every((c) => /^TEN[2-9A-HJKMNP-Z]{10}$/.test(c.code) && c.state === "unused")).toBe(true);
    expect((await extras.exportCodes(coded.id)).split("\n")[0]).toBe("code,state,order_id");
    expect(await codeOf(extras.generateCodes(chosen.id, { count: 5 }, SUB))).toBe("not_code_promotion");

    const perf = await extras.performance(coded.id);
    expect(perf.lifetime).toEqual({ uses: 0, customers: 0, discount: "0.00", orders: 0, sales: "0.00" });
  });
});
