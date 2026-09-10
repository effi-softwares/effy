import type { AuthedEvent } from "@effy/edge-shared";
import type { Context } from "aws-lambda";
import { afterEach, describe, expect, it, vi } from "vitest";

// Mock the DB seam, not the gate — so these drive the REAL authorization path (see fulfillments.test).
const query = vi.hoisted(() => vi.fn());
vi.mock("@effy/edge-shared", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@effy/edge-shared")>()),
  query,
}));

const svc = vi.hoisted(() => ({
  listOrders: vi.fn(),
  getOrder: vi.fn(),
  getActivity: vi.fn(),
  setTags: vi.fn(),
  addNote: vi.fn(),
}));
vi.mock("../orders/service", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../orders/service")>()),
  ...svc,
}));

import { FulfillmentError } from "../fulfillments/types";
import { handler as getActivity } from "./order-activity-v1-get";
import { handler as getOne } from "./order-get-v1-get";
import { handler as postNote } from "./order-notes-v1-post";
import { handler as putTags } from "./order-tags-v1-put";
import { handler as list } from "./orders-list-v1-get";

const ctx = { awsRequestId: "aws-1", callbackWaitsForEmptyEventLoop: true } as unknown as Context;

function event(opts: { path?: Record<string, string>; body?: unknown; qs?: Record<string, string> } = {}) {
  return {
    rawPath: "/shop/v1/orders",
    pathParameters: opts.path ?? null,
    queryStringParameters: opts.qs ?? null,
    body: opts.body === undefined ? null : JSON.stringify(opts.body),
    requestContext: { requestId: "req-1", authorizer: { jwt: { claims: { sub: "sub-1" } } } },
  } as unknown as AuthedEvent;
}

const grants = () => query.mockResolvedValue({ rows: [{ staff_id: "staff-1", shop_id: "shop-1" }] });
const denies = () => query.mockResolvedValue({ rows: [] });

const DETAIL = {
  id: "f-1",
  orderId: "o-1",
  orderNumber: "EFY-1",
  placedAt: new Date("2026-09-10T00:00:00Z"),
  status: "picking",
  stateChangedAt: new Date("2026-09-10T00:05:00Z"),
  readyBy: new Date("2026-09-10T01:00:00Z"),
  deliveryMethod: "standard",
  atRisk: false,
  delivery: { recipientName: "A", phone: null, line1: "1", line2: null, city: "M", region: null, postalCode: "3000", country: "AU" },
  lines: [],
  money: { currency: "AUD", shopSubtotal: "0.00", itemSubtotal: "0.00", deliveryFee: "0.00", discount: "0.00", promoCode: null, total: "0.00", refunded: "0.00", refundPending: "0.00", net: "0.00" },
  payment: { state: "paid", methodType: null, methodBrand: null, methodLast4: null, amount: "0.00", paidAt: null },
  refunds: [],
  handoff: { collectedAt: null, deliveredAt: null, unfulfillableReason: null },
  tags: [],
  notes: [],
};

afterEach(() => {
  vi.resetAllMocks();
});

describe("every console route is gated by shop membership", () => {
  const routes = [
    () => list(event(), ctx),
    () => getOne(event({ path: { id: "f-1" } }), ctx),
    () => getActivity(event({ path: { id: "f-1" } }), ctx),
    () => putTags(event({ path: { id: "f-1" }, body: { tags: [] } }), ctx),
    () => postNote(event({ path: { id: "f-1" }, body: { body: "x" } }), ctx),
  ];
  it.each(routes.map((r, i) => [i, r] as const))("route %i answers 403 to a non-member", async (_i, call) => {
    denies();
    const res = await call();
    expect(res.statusCode).toBe(403);
    expect(Object.values(svc).every((fn) => fn.mock.calls.length === 0)).toBe(true);
  });
});

describe("the list", () => {
  it("parses the query string and scopes to the resolved shop", async () => {
    grants();
    svc.listOrders.mockResolvedValue({ items: [], total: 0, page: 2, pageSize: 25, counts: {} });
    const res = await list(event({ qs: { tab: "picking", page: "2", sort: "total", dir: "desc" } }), ctx);
    expect(res.statusCode).toBe(200);
    expect(svc.listOrders).toHaveBeenCalledWith(
      expect.objectContaining({ shopId: "shop-1" }),
      expect.objectContaining({ tab: "picking", page: 2, sort: "total", dir: "desc" }),
    );
  });
});

describe("the detail", () => {
  it("answers another shop's order with the same 403 as a missing one", async () => {
    grants();
    svc.getOrder.mockRejectedValue(new FulfillmentError("not_found", "order not found"));
    const res = await getOne(event({ path: { id: "f-x" } }), ctx);
    expect(res.statusCode).toBe(403);
  });

  it("serialises dates as ISO strings", async () => {
    grants();
    svc.getOrder.mockResolvedValue(DETAIL);
    const res = await getOne(event({ path: { id: "f-1" } }), ctx);
    const body = JSON.parse(String(res.body));
    expect(body.placedAt).toBe("2026-09-10T00:00:00.000Z");
    expect(body.payment.paidAt).toBeNull();
  });
});

describe("writes", () => {
  it("adds a note with 201", async () => {
    grants();
    svc.addNote.mockResolvedValue(DETAIL);
    const res = await postNote(event({ path: { id: "f-1" }, body: { body: "hi" } }), ctx);
    expect(res.statusCode).toBe(201);
  });

  it("refuses a missing body before reaching the service", async () => {
    grants();
    const res = await putTags({ ...event({ path: { id: "f-1" } }), body: "not json" } as AuthedEvent, ctx);
    expect(res.statusCode).toBe(400);
    expect(svc.setTags).not.toHaveBeenCalled();
  });

  it("maps a validation refusal to 400", async () => {
    grants();
    svc.setTags.mockRejectedValue(new FulfillmentError("validation", "too many"));
    const res = await putTags(event({ path: { id: "f-1" }, body: { tags: [] } }), ctx);
    expect(res.statusCode).toBe(400);
  });
});
