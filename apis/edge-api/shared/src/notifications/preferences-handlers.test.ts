import type { Context } from "aws-lambda";
import { describe, expect, it, vi } from "vitest";

import type { AuthedEvent } from "../lib/claims";
import type { Queryable } from "../lib/db";
import { CONSENT_WORDING_VERSION } from "./preferences";
import { makePreferencesHandlers } from "./preferences-handlers";

const ctx = { awsRequestId: "aws-1", callbackWaitsForEmptyEventLoop: true } as unknown as Context;

function event(opts: { sub?: string; body?: unknown; raw?: string } = {}): AuthedEvent {
  return {
    rawPath: "/customer/v1/notification-preferences",
    body: opts.raw ?? (opts.body === undefined ? undefined : JSON.stringify(opts.body)),
    requestContext: { requestId: "req-1", authorizer: { jwt: { claims: opts.sub === undefined ? { sub: "sub-1" } : opts.sub ? { sub: opts.sub } : {} } } },
  } as unknown as AuthedEvent;
}

/** A database that knows one customer and records what is written. */
function fakeDb(known = true) {
  const writes: string[] = [];
  const db: Queryable = {
    query: vi.fn(async (sql: string) => {
      if (/FROM public\.customer WHERE cognito_sub/.test(sql)) return { rows: known ? [{ id: "cust-1" }] : [], rowCount: known ? 1 : 0 };
      if (/^\s*INSERT/.test(sql)) writes.push(sql.trim().split("\n")[0]!);
      if (/AS ask/.test(sql)) return { rows: [{ ask: false }], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    }) as never,
  };
  return { db, writes, transact: async <T,>(fn: (tx: Queryable) => Promise<T>) => fn(db) };
}

const code = (body: string | undefined) => (JSON.parse(body!).type as string).split("/").pop();

describe("notification preferences routes (111)", () => {
  it("401 without a subject", async () => {
    const h = makePreferencesHandlers(fakeDb());
    expect((await h.get(event({ sub: "" }), ctx)).statusCode).toBe(401);
    expect((await h.patch(event({ sub: "" }), ctx)).statusCode).toBe(401);
  });

  it("404 for a sign-in with no customer profile", async () => {
    const h = makePreferencesHandlers(fakeDb(false));
    expect((await h.get(event(), ctx)).statusCode).toBe(404);
    const res = await h.patch(event({ body: { surface: "app", changes: [{ category: "orders", channel: "push", enabled: false }] } }), ctx);
    expect(res.statusCode).toBe(404);
  });

  it("GET answers defaults, the wording version and whether to ask", async () => {
    const res = await makePreferencesHandlers(fakeDb()).get(event(), ctx);
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body!);
    expect(body.wordingVersion).toBe(CONSENT_WORDING_VERSION);
    expect(body.askForOffers).toBe(false);
    expect(body.categories.map((c: { category: string }) => c.category)).toEqual(["orders", "points", "offers", "news", "important", "support"]);
  });

  it("PATCH writes the choice and the consent answer in one go", async () => {
    const f = fakeDb();
    const res = await makePreferencesHandlers(f).patch(
      event({ body: { surface: "app", via: "settings", changes: [{ category: "orders", channel: "push", enabled: false }], consent: { offers: true }, wordingVersion: CONSENT_WORDING_VERSION } }),
      ctx,
    );
    expect(res.statusCode).toBe(200);
    expect(f.writes).toEqual([
      "INSERT INTO public.customer_notification_choice (customer_id, category, channel, enabled, surface)",
      "INSERT INTO public.customer_marketing_consent (customer_id, category, granted, surface, via, wording_version)",
    ]);
  });

  it("refusals carry their codes and write nothing", async () => {
    const f = fakeDb();
    const h = makePreferencesHandlers(f);
    const cases: Array<[unknown, number, string]> = [
      [{ surface: "app", changes: [{ category: "important", channel: "push", enabled: false }] }, 400, "category-required"],
      [{ surface: "app", changes: [{ category: "orders", channel: "sms", enabled: false }] }, 400, "invalid-preferences-change"],
      [{ surface: "app", consent: { offers: true }, via: "prompt", wordingVersion: "old" }, 409, "consent-wording-changed"],
    ];
    for (const [body, status, c] of cases) {
      const res = await h.patch(event({ body }), ctx);
      expect(res.statusCode).toBe(status);
      expect(code(res.body)).toBe(c);
    }
    expect((await h.patch(event({ raw: "{not json" }), ctx)).statusCode).toBe(400);
    expect(f.writes).toEqual([]);
  });
});
