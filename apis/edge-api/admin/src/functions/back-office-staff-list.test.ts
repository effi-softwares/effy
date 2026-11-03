import type { Context } from "aws-lambda";
import { beforeEach, describe, expect, it, vi } from "vitest";

const isActiveAdmin = vi.hoisted(() => vi.fn());
const teamList = vi.hoisted(() => vi.fn());
vi.mock("../staff/service", () => ({ isActiveAdmin, teamList }));

import type { AuthedEvent } from "@effy/edge-shared";
import { handler } from "./back-office-staff-list-v1-get";

function fakeEvent(sub: string | null = "sub-1"): AuthedEvent {
  return {
    rawPath: "/admin/v1/staff",
    requestContext: {
      requestId: "req-1",
      authorizer: { jwt: { claims: sub ? { sub } : {} } },
    },
  } as unknown as AuthedEvent;
}

const ctx = { awsRequestId: "aws-1", callbackWaitsForEmptyEventLoop: true } as unknown as Context;

const MEMBER = {
  subject: "sub-2",
  name: "Sam",
  email: "sam@example.test",
  roles: ["manager"],
  status: "active",
  lastSeenAt: null,
  createdAt: "2026-11-01T00:00:00.000Z",
};

describe("GET /admin/v1/staff (Team and access)", () => {
  beforeEach(() => {
    isActiveAdmin.mockReset();
    teamList.mockReset();
  });

  it("gives an active administrator the team", async () => {
    isActiveAdmin.mockResolvedValue(true);
    teamList.mockResolvedValue([MEMBER]);
    const res = await handler(fakeEvent(), ctx);
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body ?? "{}")).toEqual({ items: [MEMBER] });
  });

  it("refuses anyone the staff record does not make an active administrator (403), reading nothing", async () => {
    isActiveAdmin.mockResolvedValue(false);
    expect((await handler(fakeEvent(), ctx)).statusCode).toBe(403);
    expect(teamList).not.toHaveBeenCalled();
  });

  it("refuses a request with no subject (401)", async () => {
    expect((await handler(fakeEvent(null), ctx)).statusCode).toBe(401);
  });

  it("says unavailable, not empty, when the read fails", async () => {
    isActiveAdmin.mockResolvedValue(true);
    teamList.mockRejectedValue(new Error("db down"));
    expect((await handler(fakeEvent(), ctx)).statusCode).toBe(503);
  });
});
