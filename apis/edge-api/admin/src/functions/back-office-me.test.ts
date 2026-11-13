import type { Context } from "aws-lambda";
import { beforeEach, describe, expect, it, vi } from "vitest";

const loadAndTouch = vi.hoisted(() => vi.fn());
vi.mock("../staff/service", () => ({ loadAndTouch }));

import type { AuthedEvent } from "@effy/edge-shared";
import { handler } from "./back-office-me-v1-get";

function fakeEvent(groups?: string): AuthedEvent {
  return {
    rawPath: "/admin/v1/me",
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

const MEMBER = {
  id: "00000000-0000-0000-0000-000000000001",
  subject: "sub-1",
  name: "Op",
  email: "op@effy.test",
  role: "manager",
  status: "active",
  lastSeenAt: "2026-11-13T00:00:00.000Z",
};

describe("back-office /me (119: the record decides, R1)", () => {
  beforeEach(() => {
    loadAndTouch.mockReset();
  });

  it("answers the record's one role, never the token's groups", async () => {
    loadAndTouch.mockResolvedValue({ ok: true, member: MEMBER });
    const res = await handler(fakeEvent("[admin]"), ctx);
    expect(res.statusCode).toBe(200);
    expect(loadAndTouch).toHaveBeenCalledWith("sub-1");
    expect(JSON.parse(res.body ?? "{}")).toMatchObject({ subject: "sub-1", name: "Op", roles: ["manager"], status: "active" });
  });

  it("refuses an account with no record: 403 not_on_team", async () => {
    loadAndTouch.mockResolvedValue({ ok: false, refusal: "not_on_team" });
    const res = await handler(fakeEvent("[admin]"), ctx);
    expect(res.statusCode).toBe(403);
    const body = JSON.parse(res.body ?? "{}") as { type: string; detail: string };
    expect(body.type).toMatch(/not-on-team$/);
    expect(body.detail).toBe("Your back-office access has ended. Ask an administrator.");
  });

  it("refuses a disabled or removed person: 403 staff_disabled", async () => {
    loadAndTouch.mockResolvedValue({ ok: false, refusal: "staff_disabled" });
    const res = await handler(fakeEvent(), ctx);
    expect(res.statusCode).toBe(403);
    expect((JSON.parse(res.body ?? "{}") as { type: string }).type).toMatch(/staff-disabled$/);
  });

  it("says unavailable when the read fails", async () => {
    loadAndTouch.mockImplementation(async () => {
      throw new Error("db down");
    });
    expect((await handler(fakeEvent(), ctx)).statusCode).toBe(503);
  });
});
