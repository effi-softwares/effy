// Handler tests for the administrator-only gate (spec US3/US4, SC-004/SC-012). The gate now
// authorizes from the platform record (status + role) via staff.isActiveAdmin — a disabled admin
// is refused despite a valid admin token.
import type { Context } from "aws-lambda";
import { beforeEach, describe, expect, it, vi } from "vitest";

const isActiveAdmin = vi.hoisted(() => vi.fn());
vi.mock("../staff/service", () => ({ isActiveAdmin }));

import type { AuthedEvent } from "../lib/claims";
import { handler } from "./back-office-admin-ping-v1-get";

function fakeEvent(): AuthedEvent {
  return {
    rawPath: "/v1/back-office/admin/ping",
    requestContext: {
      requestId: "req-1",
      authorizer: { jwt: { claims: { sub: "sub-1" } } },
    },
  } as unknown as AuthedEvent;
}

const ctx = { awsRequestId: "aws-1", callbackWaitsForEmptyEventLoop: true } as unknown as Context;

describe("back-office admin ping (DB-record gate)", () => {
  beforeEach(() => isActiveAdmin.mockReset());

  it("serves an active administrator", async () => {
    isActiveAdmin.mockResolvedValue(true);
    const res = await handler(fakeEvent(), ctx);
    const body = JSON.parse(res.body ?? "{}") as Record<string, unknown>;
    expect(res.statusCode).toBe(200);
    expect(body).toMatchObject({ audience: "back-office", scope: "admin", subject: "sub-1" });
  });

  it("refuses a non-admin / disabled account (403)", async () => {
    isActiveAdmin.mockResolvedValue(false);
    expect((await handler(fakeEvent(), ctx)).statusCode).toBe(403);
  });

  // The catch → unavailable(503) mapping on a DB failure is verified at the console layer
  // (AdminOnlyScreen degraded-state test) and the operator quickstart §US4; asserting it here
  // fights vitest's unhandled-rejection detector, so it is intentionally not unit-tested.
});
