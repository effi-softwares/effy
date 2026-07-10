import type { AuthedEvent } from "@effy/edge-shared";
import type { Context } from "aws-lambda";
import { afterEach, describe, expect, it, vi } from "vitest";

const recordAndLoad = vi.hoisted(() => vi.fn());
vi.mock("../staff/service", () => ({ recordAndLoad, isActiveStoreManager: vi.fn() }));

import { handler } from "./store-me-v1-get";

const ctx = {
  awsRequestId: "aws-1",
  callbackWaitsForEmptyEventLoop: true,
} as unknown as Context;

function event(claims: Record<string, unknown>): AuthedEvent {
  return {
    rawPath: "/store/v1/me",
    requestContext: { requestId: "req-1", authorizer: { jwt: { claims } } },
  } as unknown as AuthedEvent;
}

const RECORD = {
  subject: "sub-1",
  email: "sam@effy.test",
  roles: ["store_manager"],
  status: "active",
  store: { id: "store-1", code: "CMB-01", name: "Colombo 01", isActive: true },
  lastSeenAt: "2026-07-09T00:00:00.000Z",
};

describe("GET /store/v1/me", () => {
  // Reset AFTER each test, not before: clearing a mock whose previous call rejected orphans
  // vitest's result-tracking promise, which then surfaces as a spurious unhandled error.
  afterEach(() => recordAndLoad.mockReset());

  it("records the operator and returns the platform record", async () => {
    recordAndLoad.mockResolvedValue(RECORD);
    const res = await handler(event({ sub: "sub-1", "cognito:groups": "[store_manager]" }), ctx);

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body as string)).toEqual(RECORD);
  });

  // /me ADMITS role-less callers — its job is to record them. Gating lives on manager-ping.
  it("admits and records a role-less operator", async () => {
    recordAndLoad.mockResolvedValue({ ...RECORD, roles: [], store: null });
    const res = await handler(event({ sub: "sub-1" }), ctx);

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body as string);
    expect(body.roles).toEqual([]);
    expect(body.store).toBeNull();
  });

  it("rejects a request with no verified subject", async () => {
    const res = await handler(event({}), ctx);
    expect(res.statusCode).toBe(401);
    expect(res.headers?.["content-type"]).toBe("application/problem+json");
    expect(recordAndLoad).not.toHaveBeenCalled();
  });

  it("passes a null email through when the token carries no address (research R6)", async () => {
    recordAndLoad.mockResolvedValue({ ...RECORD, email: null });
    // `username` is a UUID on an email-as-username pool — not an address.
    await handler(event({ sub: "sub-1", username: "9f2c-uuid-not-an-email" }), ctx);
    expect(recordAndLoad).toHaveBeenCalledWith("sub-1", null, expect.anything());
  });

  it("uses the username claim when it really is an address", async () => {
    recordAndLoad.mockResolvedValue(RECORD);
    await handler(event({ sub: "sub-1", username: "sam@effy.test" }), ctx);
    expect(recordAndLoad).toHaveBeenCalledWith("sub-1", "sam@effy.test", expect.anything());
  });

  it("returns the uniform 503 problem on a repository failure, cause withheld", async () => {
    recordAndLoad.mockImplementation(async () => {
      throw new Error('relation "public.store_staff" does not exist');
    });
    const res = await handler(event({ sub: "sub-1" }), ctx);

    expect(res.statusCode).toBe(503);
    expect(res.headers?.["content-type"]).toBe("application/problem+json");
    expect(res.body).not.toContain("store_staff");
  });
});
