import type { AuthedEvent } from "@effy/edge-shared";
import type { Context } from "aws-lambda";
import { afterEach, describe, expect, it, vi } from "vitest";

// The DB seam is mocked, not the gate, so the real authorization path runs.
const query = vi.hoisted(() => vi.fn());
vi.mock("@effy/edge-shared", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@effy/edge-shared")>()),
  query,
}));

const grants = () => query.mockResolvedValue({ rows: [{ staff_id: "staff-1", shop_id: "shop-1" }] });
/** Disabled, unassigned or inactive shop all collapse to no row. */
const denies = () => query.mockResolvedValue({ rows: [] });

const listQueue = vi.hoisted(() => vi.fn());
const getDetail = vi.hoisted(() => vi.fn());
const transition = vi.hoisted(() => vi.fn());
vi.mock("../fulfillments/service", () => ({
  listQueue,
  getDetail,
  transition,
}));

import { handler as getOne } from "./fulfillment-get-v1-get";

import { handler as postStatus } from "./fulfillment-status-v1-post";
import { handler as listAll } from "./fulfillments-list-v1-get";
import { FulfillmentError } from "../fulfillments/types";

const ctx = {
  awsRequestId: "aws-1",
  callbackWaitsForEmptyEventLoop: true,
} as unknown as Context;

function event(
  claims: Record<string, unknown>,
  opts: {
    path?: Record<string, string>;
    body?: unknown;
    qs?: Record<string, string>;
  } = {},
): AuthedEvent {
  return {
    rawPath: "/shop/v1/fulfillments",
    pathParameters: opts.path ?? null,
    queryStringParameters: opts.qs ?? null,
    body: opts.body === undefined ? null : JSON.stringify(opts.body),
    requestContext: { requestId: "req-1", authorizer: { jwt: { claims } } },
  } as unknown as AuthedEvent;
}

const DETAIL = {
  id: "f-1",
  orderNumber: "EFY-1",
  placedAt: new Date("2026-07-20T02:00:00Z"),
  status: "picking" as const,
  stateChangedAt: new Date("2026-07-20T02:05:00Z"),
  promise: { serviceLevel: "standard", readyBy: new Date("2026-07-20T03:00:00Z") },
  delivery: {
    recipientName: "A",
    phone: null,
    line1: "1 St",
    line2: null,
    city: "Melbourne",
    region: "VIC",
    postalCode: "3000",
    country: "AU",
  },
  items: [
    {
      orderItemId: "oi-1",
      name: "Rice",
      sku: "S-1",
      imageUrl: null,
      orderedQuantity: 2,
      gatheredQuantity: 1,
      unavailableQuantity: 0,
    },
  ],
};

// Reset after each test: clearing a mock whose last call rejected surfaces as an unhandled error.
afterEach(() => {
  for (const m of [query, listQueue, getDetail, transition]) {
    m.mockReset();
  }
});

describe("authorization — uniform and fail-closed (FR-019, FR-020, SC-008)", () => {
  const HANDLERS: Array<[string, (e: AuthedEvent, c: Context) => Promise<unknown>]> = [
    ["list", listAll],
    ["get", getOne],
    ["status", postStatus],
  ];

  it.each(HANDLERS)("%s rejects a request with no verified subject", async (_n, h) => {
    const res = (await h(
      event({}, { path: { id: "f-1", orderItemId: "oi-1" }, body: { to: "picking" } }),
      ctx,
    )) as { statusCode: number };

    expect(res.statusCode).toBe(401);
    expect(query).not.toHaveBeenCalled();
  });

  it.each(HANDLERS)("%s refuses a caller the platform record denies", async (_n, h) => {
    denies();
    const res = (await h(
      event({ sub: "s" }, { path: { id: "f-1", orderItemId: "oi-1" }, body: { to: "picking" } }),
      ctx,
    )) as { statusCode: number; headers?: Record<string, string> };

    expect(res.statusCode).toBe(403);
    expect(res.headers?.["content-type"]).toBe("application/problem+json");
  });

  // Every denial reason collapses to the same response.
  it("discloses nothing about which authorization term failed", async () => {
    denies();
    const res = (await listAll(event({ sub: "s" }), ctx)) as { body: string };

    const body = JSON.parse(res.body);
    const disclosure = /disabled|assign|inactive|shop_manager|shop_staff|role/i;
    expect(body.title).not.toMatch(disclosure);
    expect(body.detail).not.toMatch(disclosure);
    expect(body).not.toHaveProperty("errors");
  });

  // Fail closed.
  it("returns 503, not 200, when the authorization check itself fails", async () => {
    query.mockImplementation(async () => {
      throw new Error("connection terminated");
    });
    const res = (await listAll(event({ sub: "s" }), ctx)) as { statusCode: number; body: string };

    expect(res.statusCode).toBe(503);
    expect(res.body).not.toContain("connection terminated");
  });
});

describe("GET /shop/v1/fulfillments — the queue (US1)", () => {
  it("serves the active queue by default", async () => {
    grants();
    listQueue.mockResolvedValue([]);

    const res = (await listAll(event({ sub: "s" }), ctx)) as { statusCode: number };
    expect(res.statusCode).toBe(200);
    expect(listQueue).toHaveBeenCalledWith(expect.objectContaining({ shopId: "shop-1" }), "active");
  });

  it("serves the completed queue when asked (US4)", async () => {
    grants();
    listQueue.mockResolvedValue([]);

    await listAll(event({ sub: "s" }, { qs: { state: "completed" } }), ctx);
    expect(listQueue).toHaveBeenCalledWith(expect.anything(), "completed");
  });

  it("falls back to the active queue for an unrecognised state", async () => {
    grants();
    listQueue.mockResolvedValue([]);

    await listAll(event({ sub: "s" }, { qs: { state: "everything" } }), ctx);
    expect(listQueue).toHaveBeenCalledWith(expect.anything(), "active");
  });
});

describe("GET /shop/v1/fulfillments/{id} — the pick screen (US2)", () => {
  it("returns this shop's portion", async () => {
    grants();
    getDetail.mockResolvedValue(DETAIL);

    const res = (await getOne(event({ sub: "s" }, { path: { id: "f-1" } }), ctx)) as {
      statusCode: number;
      body: string;
    };

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).items).toHaveLength(1);
  });

  // Another shop's id and a missing id are both 403.
  it("returns 403 (not 404) for a portion outside the caller's shop", async () => {
    grants();
    getDetail.mockImplementation(async () => {
      throw new FulfillmentError("not_found", "fulfillment not found");
    });

    const res = (await getOne(event({ sub: "s" }, { path: { id: "other" } }), ctx)) as {
      statusCode: number;
    };
    expect(res.statusCode).toBe(403);
  });

  // No payment data and no order-level total on the wire.
  it("emits no payment field and no order total", async () => {
    grants();
    getDetail.mockResolvedValue(DETAIL);

    const res = (await getOne(event({ sub: "s" }, { path: { id: "f-1" } }), ctx)) as { body: string };
    const body = res.body.toLowerCase();

    for (const leak of [
      "payment",
      "stripe",
      "card",
      "grandtotal",
      "itemsubtotal",
      "deliveryfee",
      "shopid",
      "shopname",
    ]) {
      expect(body).not.toContain(leak);
    }
  });
});

describe("POST /shop/v1/fulfillments/{id}/status — transitions (US3)", () => {
  it("advances a portion", async () => {
    grants();
    transition.mockResolvedValue(DETAIL);

    const res = (await postStatus(
      event({ sub: "s" }, { path: { id: "f-1" }, body: { to: "ready_for_pickup" } }),
      ctx,
    )) as { statusCode: number };

    expect(res.statusCode).toBe(200);
    // The trailing `undefined` is the reason, required only for `unfulfillable`.
    expect(transition).toHaveBeenCalledWith(expect.anything(), "f-1", "ready_for_pickup", undefined);
  });

  // Neither `received` nor `collected` is requestable here; `withdrawn` must stay refused too.
  it.each(["received", "collected", "withdrawn", "pending", "nonsense", 42, null])(
    "rejects %s as a target state",
    async (to) => {
      grants();

      const res = (await postStatus(
        event({ sub: "s" }, { path: { id: "f-1" }, body: { to } }),
        ctx,
      )) as { statusCode: number };

      expect(res.statusCode).toBe(400);
      expect(transition).not.toHaveBeenCalled();
    },
  );

  it("maps an illegal transition to 409", async () => {
    grants();
    transition.mockImplementation(async () => {
      throw new FulfillmentError("conflict", "cannot move a collected fulfillment to picking");
    });

    const res = (await postStatus(
      event({ sub: "s" }, { path: { id: "f-1" }, body: { to: "picking" } }),
      ctx,
    )) as { statusCode: number };
    expect(res.statusCode).toBe(409);
  });

  it("requires a body", async () => {
    grants();
    const res = (await postStatus(event({ sub: "s" }, { path: { id: "f-1" } }), ctx)) as {
      statusCode: number;
    };
    expect(res.statusCode).toBe(400);
  });
});
