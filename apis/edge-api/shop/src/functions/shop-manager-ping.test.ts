import type { AuthedEvent } from "@effy/edge-shared";
import type { Context } from "aws-lambda";
import { afterEach, describe, expect, it, vi } from "vitest";

const isActiveShopManager = vi.hoisted(() => vi.fn());
vi.mock("../staff/service", () => ({ isActiveShopManager, recordAndLoad: vi.fn() }));

import { handler } from "./shop-manager-ping-v1-get";

const ctx = {
  awsRequestId: "aws-1",
  callbackWaitsForEmptyEventLoop: true,
} as unknown as Context;

function event(claims: Record<string, unknown>): AuthedEvent {
  return {
    rawPath: "/shop/v1/manager-ping",
    requestContext: { requestId: "req-1", authorizer: { jwt: { claims } } },
  } as unknown as AuthedEvent;
}

// The gate is decided in the repository from the platform record; the handler's contract is what
// it does with that boolean. Each denial below is a DIFFERENT term of the three-term predicate
// failing — and every one must look identical on the wire.
describe("GET /shop/v1/manager-ping", () => {
  // Reset AFTER each test, not before: clearing a mock whose previous call rejected orphans
  // vitest's result-tracking promise, which then surfaces as a spurious unhandled error.
  afterEach(() => isActiveShopManager.mockReset());

  it("serves an active shop manager at an active shop", async () => {
    isActiveShopManager.mockResolvedValue(true);
    const res = await handler(event({ sub: "sub-1" }), ctx);

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body as string)).toEqual({
      audience: "shop",
      scope: "shop_manager",
      subject: "sub-1",
      message: "pong",
    });
  });

  it.each([
    ["a shop_staff operator", "sub-staff"],
    ["a disabled shop manager", "sub-disabled"],
    ["a manager with no shop assignment", "sub-unassigned"],
    ["a manager at an inactive shop", "sub-inactive-shop"],
    ["a role-less operator", "sub-roleless"],
  ])("refuses %s with the uniform 403", async (_case, sub) => {
    isActiveShopManager.mockResolvedValue(false);
    const res = await handler(event({ sub }), ctx);

    expect(res.statusCode).toBe(403);
    expect(res.headers?.["content-type"]).toBe("application/problem+json");
  });

  // A 403 must not tell an unauthorized caller WHICH term failed — that leaks the platform record.
  // (`instance` legitimately echoes the request path, so scan the human-readable fields, not the
  // whole envelope.)
  it("discloses nothing about which term failed", async () => {
    isActiveShopManager.mockResolvedValue(false);
    const res = await handler(event({ sub: "sub-1" }), ctx);

    const body = JSON.parse(res.body as string);
    const disclosure = /disabled|assign|inactive|shop_manager|shop_staff|role/i;
    expect(body.title).not.toMatch(disclosure);
    expect(body.detail).not.toMatch(disclosure);
    expect(body).not.toHaveProperty("errors");
  });

  // The claim is NOT the gate: a token carrying shop_manager is still refused if the record says no.
  it("ignores a shop_manager claim when the platform record refuses", async () => {
    isActiveShopManager.mockResolvedValue(false);
    const res = await handler(event({ sub: "sub-1", "cognito:groups": "[shop_manager]" }), ctx);
    expect(res.statusCode).toBe(403);
  });

  it("rejects a request with no verified subject before checking authorization", async () => {
    const res = await handler(event({}), ctx);
    expect(res.statusCode).toBe(401);
    expect(isActiveShopManager).not.toHaveBeenCalled();
  });

  // FAIL CLOSED: a failed authorization check is never a grant.
  // (mockImplementation, not mockRejectedValue: the latter constructs the rejected promise eagerly
  // and trips vitest's unhandled-rejection tracker before the handler ever awaits it.)
  it("returns 503, not 200, when the authorization check itself fails", async () => {
    isActiveShopManager.mockImplementation(async () => {
      throw new Error("connection terminated");
    });
    const res = await handler(event({ sub: "sub-1" }), ctx);

    expect(res.statusCode).toBe(503);
    expect(res.body).not.toContain("connection terminated");
  });
});
