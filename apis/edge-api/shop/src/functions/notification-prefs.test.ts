import { afterEach, describe, expect, it, vi } from "vitest";
import type { Context } from "aws-lambda";

const readRegistration = vi.fn();
const setMutedTypes = vi.fn();

vi.mock("@effy/edge-shared", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  readRegistration: (...a: unknown[]) => readRegistration(...a),
  setMutedTypes: (...a: unknown[]) => setMutedTypes(...a),
  query: vi.fn(),
}));

import { SHOP_NOTIFICATION_TYPES, type AuthedEvent } from "@effy/edge-shared";

import { handler as getHandler } from "./shop-notification-prefs-v1-get";
import { handler as patchHandler } from "./shop-notification-prefs-v1-patch";

const ctx = { awsRequestId: "aws-1", callbackWaitsForEmptyEventLoop: true } as unknown as Context;

function event(sub: string | undefined, over: Record<string, unknown> = {}): AuthedEvent {
  return {
    rawPath: "/shop/v1/notification-preferences",
    requestContext: { requestId: "req-1", authorizer: { jwt: { claims: sub ? { sub } : {} } } },
    ...over,
  } as unknown as AuthedEvent;
}

const body = (v: unknown) => ({ body: JSON.stringify(v) });

afterEach(() => vi.clearAllMocks());

describe("GET — N1: an unregistered device renders, it does not error", () => {
  it("answers registered:false rather than 404", async () => {
    // The settings screen must be able to say "not enabled on this device". An error here would
    // make a perfectly normal state look like a fault.
    readRegistration.mockResolvedValue(null);
    const res = await getHandler(event("sub-1", { queryStringParameters: { token: "tok" } }), ctx);
    expect(res.statusCode).toBe(200);
    const dto = JSON.parse(res.body as string);
    expect(dto.registered).toBe(false);
    expect(dto.mutedTypes).toEqual([]);
  });

  it("returns this registration's own settings", async () => {
    readRegistration.mockResolvedValue({ platform: "web", mutedTypes: ["shop_low_stock"] });
    const res = await getHandler(event("sub-1", { queryStringParameters: { token: "tok" } }), ctx);
    const dto = JSON.parse(res.body as string);
    expect(dto.registered).toBe(true);
    expect(dto.mutedTypes).toEqual(["shop_low_stock"]);
    // ⚠ Scoped to the CALLER's subject, never to a subject in the request.
    expect(readRegistration).toHaveBeenCalledWith("sub-1", "tok");
  });

  it("401 without a token", async () => {
    const res = await getHandler(event(undefined, { queryStringParameters: { token: "t" } }), ctx);
    expect(res.statusCode).toBe(401);
  });

  it("400 without the token parameter", async () => {
    const res = await getHandler(event("sub-1"), ctx);
    expect(res.statusCode).toBe(400);
  });
});

describe("⚠ N10 — the type list is SERVED, from one catalogue", () => {
  it("returns every shop notification type with its label", async () => {
    readRegistration.mockResolvedValue(null);
    const res = await getHandler(event("sub-1", { queryStringParameters: { token: "tok" } }), ctx);
    const dto = JSON.parse(res.body as string);
    expect(dto.availableTypes).toEqual(SHOP_NOTIFICATION_TYPES);
    expect(dto.availableTypes).toHaveLength(5);
  });

  it("⚠ marks the manager-only type as such — a HINT, never the gate", () => {
    const refund = SHOP_NOTIFICATION_TYPES.find((t) => t.type === "shop_refund_proposed");
    expect(refund?.requiresRole).toBe("shop_manager");
    // The real filter is in the evaluator, against the platform record. A `shop_staff` operator who
    // forges this field still receives nothing, because nothing is ever enqueued for them.
  });
});

describe("PATCH — N2/N4: the set is closed, and empty is a value", () => {
  it("N2: refuses an unknown type, naming it", async () => {
    const res = await patchHandler(
      event("sub-1", body({ fcmToken: "tok", mutedTypes: ["shop_unicorns"] })),
      ctx,
    );
    expect(res.statusCode).toBe(400);
    expect(res.body).toContain("shop_unicorns");
    expect(setMutedTypes).not.toHaveBeenCalled();
  });

  it("N4: an empty array means everything on, and is accepted", async () => {
    // ⚠ `[]` is a VALUE, not an absence. 056 shipped the inverse defect — a COALESCE that could not
    // tell "leave alone" from "clear", so a driver's zone was permanent once set.
    setMutedTypes.mockResolvedValue(true);
    const res = await patchHandler(event("sub-1", body({ fcmToken: "tok", mutedTypes: [] })), ctx);
    expect(res.statusCode).toBe(204);
    expect(setMutedTypes).toHaveBeenCalledWith("sub-1", "tok", []);
  });

  it("replaces wholesale", async () => {
    setMutedTypes.mockResolvedValue(true);
    await patchHandler(
      event("sub-1", body({ fcmToken: "tok", mutedTypes: ["shop_low_stock", "shop_out_of_stock"] })),
      ctx,
    );
    expect(setMutedTypes).toHaveBeenCalledWith("sub-1", "tok", [
      "shop_low_stock",
      "shop_out_of_stock",
    ]);
  });

  it("refuses a non-array", async () => {
    const res = await patchHandler(
      event("sub-1", body({ fcmToken: "tok", mutedTypes: "shop_low_stock" })),
      ctx,
    );
    expect(res.statusCode).toBe(400);
  });

  it("401 without a token", async () => {
    const res = await patchHandler(event(undefined, body({ fcmToken: "t", mutedTypes: [] })), ctx);
    expect(res.statusCode).toBe(401);
  });
});

describe("⚠ N3 — the route is not an oracle for which tokens exist", () => {
  it("answers identically for 'not yours' and 'no such token'", async () => {
    setMutedTypes.mockResolvedValue(false);

    const notYours = await patchHandler(
      event("sub-1", body({ fcmToken: "someone-elses", mutedTypes: [] })),
      ctx,
    );
    const noSuch = await patchHandler(
      event("sub-1", body({ fcmToken: "does-not-exist", mutedTypes: [] })),
      ctx,
    );

    expect(notYours.statusCode).toBe(404);
    expect(noSuch.statusCode).toBe(404);
    // ⚠ BYTE-IDENTICAL but for the request id. A distinguishable refusal would let anyone holding a
    // shop session enumerate which FCM tokens are registered on the platform — 052 made the same
    // argument for the receipt resend, where "not yours" and "no such order" are one refusal.
    const strip = (b: string) => b.replace(/"requestId":"[^"]*"/, "");
    expect(strip(notYours.body as string)).toBe(strip(noSuch.body as string));
  });
});
