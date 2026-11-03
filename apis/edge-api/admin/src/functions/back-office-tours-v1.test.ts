import { afterEach, describe, expect, it, vi } from "vitest";
import type { Context } from "aws-lambda";

const getTourState = vi.fn();
const changeTourState = vi.fn();

vi.mock("@effy/edge-shared/tours", () => ({
  getTourState: (...a: unknown[]) => getTourState(...a),
  changeTourState: (...a: unknown[]) => changeTourState(...a),
}));

import type { AuthedEvent } from "@effy/edge-shared";

import { handler as getHandler } from "./back-office-tours-v1-get";
import { handler as patchHandler } from "./back-office-tours-v1-patch";

const ctx = { awsRequestId: "aws-1", callbackWaitsForEmptyEventLoop: true } as unknown as Context;

function event(sub: string | undefined, body?: string): AuthedEvent {
  return {
    rawPath: "/admin/v1/me/tours",
    requestContext: { requestId: "req-1", authorizer: { jwt: { claims: sub ? { sub } : {} } } },
    ...(body === undefined ? {} : { body }),
  } as unknown as AuthedEvent;
}

const STATE = { offerTours: true, seen: { welcome: { version: 1, outcome: "finished", at: "2026-11-03T00:00:00.000Z" } } };

afterEach(() => vi.clearAllMocks());

describe("GET /admin/v1/me/tours (106)", () => {
  it("401 without a subject", async () => {
    expect((await getHandler(event(undefined), ctx)).statusCode).toBe(401);
    expect(getTourState).not.toHaveBeenCalled();
  });

  it("reads the caller's own back-office row", async () => {
    getTourState.mockResolvedValue(STATE);
    const res = await getHandler(event("sub-1"), ctx);
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body as string)).toEqual(STATE);
    expect(getTourState).toHaveBeenCalledWith("admin", "sub-1");
  });

  it("503 when the read fails", async () => {
    getTourState.mockRejectedValue(new Error("db down"));
    expect((await getHandler(event("sub-1"), ctx)).statusCode).toBe(503);
  });
});

describe("PATCH /admin/v1/me/tours (106)", () => {
  it("401 without a subject", async () => {
    expect((await patchHandler(event(undefined, "{}"), ctx)).statusCode).toBe(401);
  });

  it("400 on a body that is not JSON", async () => {
    expect((await patchHandler(event("sub-1", "{nope"), ctx)).statusCode).toBe(400);
    expect(changeTourState).not.toHaveBeenCalled();
  });

  it("400 with the service's message when the change is refused as invalid", async () => {
    changeTourState.mockResolvedValue({ ok: false, refused: "invalid", message: "send exactly one change" });
    const res = await patchHandler(event("sub-1", JSON.stringify({ offerTours: true, reset: true })), ctx);
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body as string).detail).toBe("send exactly one change");
  });

  it("409 tour-state-full", async () => {
    changeTourState.mockResolvedValue({ ok: false, refused: "full" });
    const res = await patchHandler(event("sub-1", JSON.stringify({ tour: "x", version: 1, outcome: "declined" })), ctx);
    expect(res.statusCode).toBe(409);
    expect(JSON.parse(res.body as string).type).toBe("https://effyshopping.com/problems/tour-state-full");
  });

  it("200 with the new state; the audience is always admin, whatever the body says", async () => {
    changeTourState.mockResolvedValue({ ok: true, state: STATE });
    const body = { tour: "welcome", version: 1, outcome: "finished", audience: "shop" };
    const res = await patchHandler(event("sub-1", JSON.stringify(body)), ctx);
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body as string)).toEqual(STATE);
    expect(changeTourState).toHaveBeenCalledWith("admin", "sub-1", body);
  });
});
