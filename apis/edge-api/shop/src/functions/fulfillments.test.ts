import type { AuthedEvent } from "@effy/edge-shared";
import type { Context } from "aws-lambda";
import { afterEach, describe, expect, it, vi } from "vitest";

// Mock the DB seam, not the gate: gate() calls resolveActor() internally, and under ESM an
// internal call is unaffected by mocking the module's export. Driving the real gate through
// `query` also means these tests exercise the actual authorization path rather than a stand-in.
const query = vi.hoisted(() => vi.fn());
vi.mock("@effy/edge-shared", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@effy/edge-shared")>()),
  query,
}));

/** The gate resolves an active member of an active shop. */
const grants = () => query.mockResolvedValue({ rows: [{ staff_id: "staff-1", shop_id: "shop-1" }] });
/** Uniform deny — disabled, unassigned, or inactive shop all collapse to no row. */
const denies = () => query.mockResolvedValue({ rows: [] });

const listQueue = vi.hoisted(() => vi.fn());
const getDetail = vi.hoisted(() => vi.fn());
const transition = vi.hoisted(() => vi.fn());
const updateItemProgress = vi.hoisted(() => vi.fn());
const collectViaStub = vi.hoisted(() => vi.fn());
vi.mock("../fulfillments/service", () => ({
  listQueue,
  getDetail,
  transition,
  updateItemProgress,
  collectViaStub,
}));

import { handler as getOne } from "./fulfillment-get-v1-get";
import { handler as patchItem } from "./fulfillment-item-v1-patch";
import { handler as postPickup } from "./fulfillment-pickup-v1-post";
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

const ACTOR = { shopId: "shop-1", staffId: "staff-1" };

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

// Reset AFTER each test — clearing a mock whose previous call rejected orphans vitest's
// result-tracking promise and surfaces as a spurious unhandled error.
afterEach(() => {
  for (const m of [query, listQueue, getDetail, transition, updateItemProgress, collectViaStub]) {
    m.mockReset();
  }
});

describe("authorization — uniform and fail-closed (FR-019, FR-020, SC-008)", () => {
  const HANDLERS: Array<[string, (e: AuthedEvent, c: Context) => Promise<unknown>]> = [
    ["list", listAll],
    ["get", getOne],
    ["status", postStatus],
    ["item", patchItem],
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

  // Every denial reason — disabled operator, unassigned, inactive shop — collapses to the same
  // falsity in the resolver, so the wire response cannot distinguish them.
  it("discloses nothing about which authorization term failed", async () => {
    denies();
    const res = (await listAll(event({ sub: "s" }), ctx)) as { body: string };

    const body = JSON.parse(res.body);
    const disclosure = /disabled|assign|inactive|shop_manager|shop_staff|role/i;
    expect(body.title).not.toMatch(disclosure);
    expect(body.detail).not.toMatch(disclosure);
    expect(body).not.toHaveProperty("errors");
  });

  // FAIL CLOSED — an authorization check that throws is never a grant.
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

  // An unrecognised value must never silently widen the result set.
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

  // SC-007: response codes must not be usable to enumerate other shops' portions, so another
  // shop's id and a nonexistent id must look identical — both 403, never 404.
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

  // SC-007 / FR-008 — the wire must carry no payment data and no order-level total.
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
    expect(transition).toHaveBeenCalledWith(expect.anything(), "f-1", "ready_for_pickup");
  });

  // `received` is implicit on open and `collected` belongs to the stub — neither is requestable
  // over this endpoint, so a client cannot use it to skip or forge a state.
  it.each(["received", "collected", "pending", "nonsense", 42, null])(
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

describe("PATCH .../items/{orderItemId} — picking progress (US2)", () => {
  it("records progress", async () => {
    grants();
    updateItemProgress.mockResolvedValue(DETAIL);

    const res = (await patchItem(
      event({ sub: "s" }, { path: { id: "f-1", orderItemId: "oi-1" }, body: { gatheredQuantity: 2 } }),
      ctx,
    )) as { statusCode: number };

    expect(res.statusCode).toBe(200);
    expect(updateItemProgress).toHaveBeenCalledWith(expect.anything(), "f-1", "oi-1", {
      gatheredQuantity: 2,
    });
  });

  it("maps over-accounting to 400 with a field error", async () => {
    grants();
    updateItemProgress.mockImplementation(async () => {
      throw new FulfillmentError("validation", "quantities exceed the quantity ordered", [
        { field: "gatheredQuantity", message: "gathered + unavailable cannot exceed ordered" },
      ]);
    });

    const res = (await patchItem(
      event(
        { sub: "s" },
        { path: { id: "f-1", orderItemId: "oi-1" }, body: { gatheredQuantity: 99 } },
      ),
      ctx,
    )) as { statusCode: number; body: string };

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).errors).toHaveLength(1);
  });

  it("maps editing a non-picking portion to 409", async () => {
    grants();
    updateItemProgress.mockImplementation(async () => {
      throw new FulfillmentError("conflict", "items can only be recorded while picking");
    });

    const res = (await patchItem(
      event({ sub: "s" }, { path: { id: "f-1", orderItemId: "oi-1" }, body: { gatheredQuantity: 1 } }),
      ctx,
    )) as { statusCode: number };
    expect(res.statusCode).toBe(409);
  });
});

describe("the pickup stub handler — ⚠ dev-only (US3a)", () => {
  // The handler exists and is authorized like any other. Its containment is that NO ROUTE points at
  // it in any stage (serverless.yml), which is asserted separately by the deployment probe (SC-013).
  it("still enforces authorization when invoked directly", async () => {
    denies();

    const res = (await postPickup(
      event({ sub: "s" }, { path: { id: "f-1" }, body: { driverRef: "d" } }),
      ctx,
    )) as { statusCode: number };
    expect(res.statusCode).toBe(403);
    expect(collectViaStub).not.toHaveBeenCalled();
  });

  it("collects a ready portion with a placeholder driver reference", async () => {
    grants();
    collectViaStub.mockResolvedValue({ ...DETAIL, status: "collected" });

    const res = (await postPickup(
      event({ sub: "s" }, { path: { id: "f-1" }, body: { driverRef: "test-driver-1" } }),
      ctx,
    )) as { statusCode: number };

    expect(res.statusCode).toBe(200);
    expect(collectViaStub).toHaveBeenCalledWith(expect.anything(), "f-1", "test-driver-1");
  });

  it("requires a driver reference", async () => {
    grants();

    const res = (await postPickup(event({ sub: "s" }, { path: { id: "f-1" }, body: {} }), ctx)) as {
      statusCode: number;
    };
    expect(res.statusCode).toBe(400);
  });
});
