import { afterEach, describe, expect, it, vi } from "vitest";
import type { Context } from "aws-lambda";

const query = vi.fn();
vi.mock("./db", () => ({
  query: (...a: unknown[]) => query(...a),
}));

import type { AuthedEvent } from "./claims";
import {
  DeviceValidationError,
  makeDeviceDeleteHandler,
  makeDevicePostHandler,
  registerDevice,
  tokensForRecipient,
  unregisterDevice,
} from "./devices";

const ctx = { awsRequestId: "aws-1", callbackWaitsForEmptyEventLoop: true } as unknown as Context;

function postEvent(sub: string | undefined, body?: unknown): AuthedEvent {
  return {
    rawPath: "/customer/v1/devices",
    body: body === undefined ? undefined : JSON.stringify(body),
    requestContext: { requestId: "req-1", authorizer: { jwt: { claims: sub ? { sub } : {} } } },
  } as unknown as AuthedEvent;
}

function deleteEvent(sub: string | undefined, token?: string): AuthedEvent {
  return {
    rawPath: "/customer/v1/devices/x",
    pathParameters: token ? { token } : undefined,
    requestContext: { requestId: "req-1", authorizer: { jwt: { claims: sub ? { sub } : {} } } },
  } as unknown as AuthedEvent;
}

afterEach(() => vi.clearAllMocks());

describe("registerDevice — validation + idempotent upsert (SC-009)", () => {
  it("rejects an empty token", async () => {
    await expect(
      registerDevice({ sub: "s1", audience: "customer", fcmToken: "  ", platform: "android" }),
    ).rejects.toBeInstanceOf(DeviceValidationError);
    expect(query).not.toHaveBeenCalled();
  });

  it("rejects an invalid platform", async () => {
    await expect(
      registerDevice({
        sub: "s1",
        audience: "customer",
        fcmToken: "tok",
        platform: "web" as never,
      }),
    ).rejects.toBeInstanceOf(DeviceValidationError);
  });

  it("upserts on fcm_token (rotation-safe, no duplicate row)", async () => {
    query.mockResolvedValue({ rows: [] });
    await registerDevice({
      sub: "s1",
      audience: "shop",
      fcmToken: "tok-1",
      platform: "ios",
      appVersion: "1.2.3",
    });
    expect(query).toHaveBeenCalledTimes(1);
    const [sql, args] = query.mock.calls[0]!;
    expect(String(sql)).toMatch(/ON CONFLICT \(fcm_token\) DO UPDATE/);
    expect(args).toEqual(["s1", "shop", "ios", "tok-1", "1.2.3"]);
  });
});

describe("unregisterDevice — only the caller's own token (FR-020)", () => {
  it("deletes scoped to token AND subject", async () => {
    query.mockResolvedValue({ rows: [] });
    await unregisterDevice("s1", "tok-1");
    const [sql, args] = query.mock.calls[0]!;
    expect(String(sql)).toMatch(/DELETE FROM public\.device_token WHERE fcm_token = \$1 AND subject_sub = \$2/);
    expect(args).toEqual(["tok-1", "s1"]);
  });
});

describe("tokensForRecipient — fan-out lookup", () => {
  it("returns the recipient's active tokens", async () => {
    query.mockResolvedValue({ rows: [{ fcmToken: "a", platform: "android" }] });
    const rows = await tokensForRecipient("s1", "customer");
    expect(rows).toEqual([{ fcmToken: "a", platform: "android" }]);
    const [, args] = query.mock.calls[0]!;
    expect(args).toEqual(["s1", "customer"]);
  });
});

describe("makeDevicePostHandler — auth + validation", () => {
  const handler = makeDevicePostHandler("driver");

  it("401 when unauthenticated (owner comes from the JWT, never the body)", async () => {
    const res = await handler(postEvent(undefined, { fcmToken: "t", platform: "android" }), ctx);
    expect(res.statusCode).toBe(401);
    expect(query).not.toHaveBeenCalled();
  });

  it("400 on a malformed body", async () => {
    const res = await handler(postEvent("s1", undefined), ctx);
    expect(res.statusCode).toBe(400);
  });

  it("400 on a bad platform (DeviceValidationError → problem)", async () => {
    const res = await handler(postEvent("s1", { fcmToken: "t", platform: "desktop" }), ctx);
    expect(res.statusCode).toBe(400);
  });

  it("204 and registers with the JWT subject on a valid request", async () => {
    query.mockResolvedValue({ rows: [] });
    const res = await handler(postEvent("s1", { fcmToken: "t", platform: "android" }), ctx);
    expect(res.statusCode).toBe(204);
    const [, args] = query.mock.calls[0]!;
    expect(args?.[0]).toBe("s1"); // subject from token
    expect(args?.[1]).toBe("driver"); // audience fixed by the factory, not the body
  });
});

describe("makeDeviceDeleteHandler — idempotent, caller-scoped", () => {
  const handler = makeDeviceDeleteHandler("customer");

  it("401 when unauthenticated", async () => {
    const res = await handler(deleteEvent(undefined, "tok"), ctx);
    expect(res.statusCode).toBe(401);
  });

  it("400 when no token path param", async () => {
    const res = await handler(deleteEvent("s1", undefined), ctx);
    expect(res.statusCode).toBe(400);
  });

  it("204 and deletes scoped to the caller", async () => {
    query.mockResolvedValue({ rows: [] });
    const res = await handler(deleteEvent("s1", "tok-1"), ctx);
    expect(res.statusCode).toBe(204);
    const [, args] = query.mock.calls[0]!;
    expect(args).toEqual(["tok-1", "s1"]);
  });
});
