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
  readRegistration,
  registerDevice,
  setMutedTypes,
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

describe("registerDevice - validation + idempotent upsert (SC-009)", () => {
  it("rejects an empty token", async () => {
    await expect(
      registerDevice({ sub: "s1", audience: "customer", fcmToken: "  ", platform: "android" }),
    ).rejects.toBeInstanceOf(DeviceValidationError);
    expect(query).not.toHaveBeenCalled();
  });

  // "web" is valid; the invalid example is still genuinely invalid.
  it("rejects an invalid platform (C2)", async () => {
    await expect(
      registerDevice({
        sub: "s1",
        audience: "customer",
        fcmToken: "tok",
        platform: "windows" as never,
      }),
    ).rejects.toBeInstanceOf(DeviceValidationError);
    expect(query).not.toHaveBeenCalled();
  });

  it("names the accepted set in the refusal, rather than a stale hardcoded list (C2)", async () => {
    // The message must list every platform.
    await expect(
      registerDevice({
        sub: "s1",
        audience: "customer",
        fcmToken: "tok",
        platform: "windows" as never,
      }),
    ).rejects.toThrow(/web/);
  });

  it("accepts platform web (C1) - the defect fix", async () => {
    query.mockResolvedValue({ rows: [] });
    await registerDevice({ sub: "s1", audience: "shop", fcmToken: "tok-w", platform: "web" });
    expect(query).toHaveBeenCalledTimes(1);
    const [, args] = query.mock.calls[0]!;
    expect(args?.[2]).toBe("web");
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
    // muted_types: `null` because no preferences were sent, which preserves what is stored.
    expect(args).toEqual(["s1", "shop", "ios", "tok-1", "1.2.3", null]);
  });
});

describe("registerDevice - mutedTypes (C3/C4/C5)", () => {
  it("refuses mutedTypes on a mobile platform rather than ignoring it (C3)", async () => {
    // Refused, not ignored: the mobile apps have no preference UI.
    await expect(
      registerDevice({
        sub: "s1",
        audience: "shop",
        fcmToken: "tok",
        platform: "ios",
        mutedTypes: ["shop_low_stock"],
      }),
    ).rejects.toBeInstanceOf(DeviceValidationError);
    expect(query).not.toHaveBeenCalled();
  });

  it("PRESERVES stored preferences when the key is absent (C4)", async () => {
    // The console re-registers on every launch without `mutedTypes`; absence must not clear them.
    query.mockResolvedValue({ rows: [] });
    await registerDevice({ sub: "s1", audience: "shop", fcmToken: "tok", platform: "web" });
    const [sql, args] = query.mock.calls[0]!;
    expect(args?.[5]).toBeNull();
    // The SQL falls back to the existing column, not '{}'.
    expect(String(sql)).toMatch(/COALESCE\(\$6::text\[\], device_token\.muted_types\)/);
  });

  it("CLEARS preferences when the key is present and empty (C5)", async () => {
    // `[]` is a value meaning "everything on", not an absence.
    query.mockResolvedValue({ rows: [] });
    await registerDevice({
      sub: "s1",
      audience: "shop",
      fcmToken: "tok",
      platform: "web",
      mutedTypes: [],
    });
    const [, args] = query.mock.calls[0]!;
    expect(args?.[5]).toEqual([]);
  });

  it("replaces preferences wholesale when the key is present and non-empty", async () => {
    query.mockResolvedValue({ rows: [] });
    await registerDevice({
      sub: "s1",
      audience: "shop",
      fcmToken: "tok",
      platform: "web",
      mutedTypes: ["shop_low_stock", "shop_out_of_stock"],
    });
    const [, args] = query.mock.calls[0]!;
    expect(args?.[5]).toEqual(["shop_low_stock", "shop_out_of_stock"]);
  });

  it("refuses a non-string entry", async () => {
    await expect(
      registerDevice({
        sub: "s1",
        audience: "shop",
        fcmToken: "tok",
        platform: "web",
        mutedTypes: [42 as never],
      }),
    ).rejects.toBeInstanceOf(DeviceValidationError);
  });
});

describe("readRegistration / setMutedTypes - caller-scoped, no oracle (N3)", () => {
  it("reads only the caller's own registration", async () => {
    query.mockResolvedValue({ rows: [{ platform: "web", mutedTypes: ["shop_low_stock"] }] });
    const r = await readRegistration("s1", "tok-1");
    expect(r).toEqual({ platform: "web", mutedTypes: ["shop_low_stock"] });
    const [sql, args] = query.mock.calls[0]!;
    expect(String(sql)).toMatch(/fcm_token = \$1 AND subject_sub = \$2/);
    expect(args).toEqual(["tok-1", "s1"]);
  });

  it("returns null for a token that is not the caller's - indistinguishably from one that does not exist", async () => {
    // Indistinguishable, or the route reveals which tokens are registered.
    query.mockResolvedValue({ rows: [] });
    expect(await readRegistration("s1", "someone-elses-token")).toBeNull();
    expect(await readRegistration("s1", "no-such-token")).toBeNull();
  });

  it("reports whether the update matched, scoped to the caller", async () => {
    query.mockResolvedValue({ rows: [], rowCount: 1 });
    expect(await setMutedTypes("s1", "tok-1", ["shop_low_stock"])).toBe(true);
    const [sql, args] = query.mock.calls[0]!;
    expect(String(sql)).toMatch(/fcm_token = \$1 AND subject_sub = \$2/);
    expect(args).toEqual(["tok-1", "s1", ["shop_low_stock"]]);
  });

  it("reports false when nothing matched", async () => {
    query.mockResolvedValue({ rows: [], rowCount: 0 });
    expect(await setMutedTypes("s1", "tok-x", [])).toBe(false);
  });
});

describe("unregisterDevice - only the caller's own token (FR-020)", () => {
  it("deletes scoped to token AND subject", async () => {
    query.mockResolvedValue({ rows: [] });
    await unregisterDevice("s1", "tok-1");
    const [sql, args] = query.mock.calls[0]!;
    expect(String(sql)).toMatch(/DELETE FROM public\.device_token WHERE fcm_token = \$1 AND subject_sub = \$2/);
    expect(args).toEqual(["tok-1", "s1"]);
  });
});

describe("tokensForRecipient - fan-out lookup", () => {
  it("returns the recipient's active tokens", async () => {
    query.mockResolvedValue({ rows: [{ fcmToken: "a", platform: "android" }] });
    const rows = await tokensForRecipient("s1", "customer");
    expect(rows).toEqual([{ fcmToken: "a", platform: "android" }]);
    const [, args] = query.mock.calls[0]!;
    expect(args).toEqual(["s1", "customer"]);
  });

  it("selects muted_types so the worker can honour a preference (059)", async () => {
    query.mockResolvedValue({ rows: [] });
    await tokensForRecipient("s1", "shop");
    // A SELECT without the column would make every filter read "nothing muted".
    expect(String(query.mock.calls[0]![0])).toMatch(/muted_types AS "mutedTypes"/);
  });
});

describe("makeDevicePostHandler - auth + validation", () => {
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

  it("passes mutedTypes through only when the key is present (059 C4)", async () => {
    const webHandler = makeDevicePostHandler("shop");
    query.mockResolvedValue({ rows: [] });

    await webHandler(postEvent("s1", { fcmToken: "t", platform: "web" }), ctx);
    expect(query.mock.calls[0]![1]?.[5]).toBeNull();

    query.mockClear();
    await webHandler(postEvent("s1", { fcmToken: "t", platform: "web", mutedTypes: [] }), ctx);
    expect(query.mock.calls[0]![1]?.[5]).toEqual([]);
  });

  it("204 and registers with the JWT subject on a valid request", async () => {
    query.mockResolvedValue({ rows: [] });
    const res = await handler(postEvent("s1", { fcmToken: "t", platform: "android" }), ctx);
    expect(res.statusCode).toBe(204);
    const [, args] = query.mock.calls[0]!;
    expect(args?.[0]).toBe("s1");
    expect(args?.[1]).toBe("driver");
  });
});

describe("makeDeviceDeleteHandler - idempotent, caller-scoped", () => {
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
