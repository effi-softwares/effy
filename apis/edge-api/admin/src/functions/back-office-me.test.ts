// Handler test for GET /me — records the staff member (JIT) and returns the platform record,
// admitting role-less callers (roles: []).
import type { Context } from "aws-lambda";
import { describe, expect, it, vi } from "vitest";

const recordAndLoad = vi.hoisted(() => vi.fn());
vi.mock("../staff/service", () => ({ recordAndLoad }));

import type { AuthedEvent } from "@effy/edge-shared";
import { handler } from "./back-office-me-v1-get";

function fakeEvent(groups?: string): AuthedEvent {
  return {
    rawPath: "/v1/back-office/me",
    requestContext: {
      requestId: "req-1",
      authorizer: {
        jwt: {
          claims: {
            sub: "sub-1",
            username: "op@effy.test",
            ...(groups !== undefined ? { "cognito:groups": groups } : {}),
          },
        },
      },
    },
  } as unknown as AuthedEvent;
}

const ctx = { awsRequestId: "aws-1", callbackWaitsForEmptyEventLoop: true } as unknown as Context;

describe("back-office /me", () => {
  it("records and returns the staff record", async () => {
    recordAndLoad.mockResolvedValue({
      subject: "sub-1",
      email: "op@effy.test",
      roles: ["admin"],
      status: "active",
      lastSeenAt: "2026-07-08T00:00:00.000Z",
    });
    const res = await handler(fakeEvent("[admin]"), ctx);
    const body = JSON.parse(res.body ?? "{}") as Record<string, unknown>;

    expect(res.statusCode).toBe(200);
    expect(recordAndLoad).toHaveBeenCalledWith("sub-1", "op@effy.test", ["admin"]);
    expect(body).toMatchObject({ subject: "sub-1", roles: ["admin"], status: "active" });
  });

  it("admits a group-less caller (records them with no roles)", async () => {
    recordAndLoad.mockResolvedValue({
      subject: "sub-2",
      email: "new@effy.test",
      roles: [],
      status: "active",
      lastSeenAt: "2026-07-08T00:00:00.000Z",
    });
    const res = await handler(fakeEvent(undefined), ctx);
    const body = JSON.parse(res.body ?? "{}") as { roles: string[] };
    expect(res.statusCode).toBe(200);
    expect(body.roles).toEqual([]);
  });
});
