import type { Context } from "aws-lambda";
import { describe, expect, it } from "vitest";

import type { AuthedEvent } from "./claims";
import { resolveCustomer } from "./customer-identity";
import { preamble } from "./http";

function event(sub?: string): AuthedEvent {
  return {
    rawPath: "/commerce/v1/cart",
    requestContext: {
      requestId: "req-1",
      authorizer: sub ? { jwt: { claims: { sub } } } : undefined,
    },
  } as unknown as AuthedEvent;
}

const scope = preamble(event("s"), { callbackWaitsForEmptyEventLoop: true } as unknown as Context);
const row = (status: string, closure: string) => async () => ({ id: "cust-1", status, closure_state: closure });

describe("resolveCustomer", () => {
  it("resolves an active customer to their platform id", async () => {
    const r = await resolveCustomer(event("sub-1"), scope, row("active", "none"));
    expect(r).toEqual({ ok: true, customer: { id: "cust-1", sub: "sub-1" } });
  });

  it("no subject on the request is the uniform 401", async () => {
    const r = await resolveCustomer(event(), scope, row("active", "none"));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.response.statusCode).toBe(401);
  });

  it("no platform record is the SAME 401 — indistinguishable from a bad token", async () => {
    const none = await resolveCustomer(event("sub-1"), scope, async () => undefined);
    const anon = await resolveCustomer(event(), scope, async () => undefined);
    expect(none.ok).toBe(false);
    if (!none.ok && !anon.ok) expect(none.response.body).toBe(anon.response.body);
  });

  it("barred and closing are refused with byte-identical 403s", async () => {
    const barred = await resolveCustomer(event("sub-1"), scope, row("barred", "none"));
    const closing = await resolveCustomer(event("sub-1"), scope, row("active", "closing"));
    expect(barred.ok).toBe(false);
    expect(closing.ok).toBe(false);
    if (!barred.ok && !closing.ok) {
      expect(barred.response.statusCode).toBe(403);
      expect(barred.response.body).toBe(closing.response.body);
    }
  });

  it("a lookup failure propagates — it is never mistaken for 'not signed in'", async () => {
    await expect(
      resolveCustomer(event("sub-1"), scope, async () => {
        throw new Error("db down");
      }),
    ).rejects.toThrow("db down");
  });
});
