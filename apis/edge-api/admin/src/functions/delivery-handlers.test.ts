import type { AuthedEvent } from "@effy/edge-shared";
import type { Context } from "aws-lambda";
import { afterEach, describe, expect, it, vi } from "vitest";

// Authorize from the platform record — mock the two predicates at the module boundary.
const isActiveStaff = vi.hoisted(() => vi.fn());
const canManageDelivery = vi.hoisted(() => vi.fn());
vi.mock("../delivery/authz", () => ({ isActiveStaff, canManageDelivery }));

const service = vi.hoisted(() => ({
  listZones: vi.fn(),
  createZone: vi.fn(),
  createOffering: vi.fn(),
  setShopLocation: vi.fn(),
}));
vi.mock("../delivery/service", () => service);

import { handler as createOfferingHandler } from "./delivery-offering-create-v1-post";
import { handler as createZoneHandler } from "./delivery-zone-create-v1-post";
import { handler as listZonesHandler } from "./delivery-zones-list-v1-get";
import { handler as shopLocationHandler } from "./shop-location-update-v1-patch";

const ctx = { awsRequestId: "aws-1", callbackWaitsForEmptyEventLoop: true } as unknown as Context;

function event(sub: string | undefined, body?: unknown, pathParameters?: Record<string, string>): AuthedEvent {
  return {
    rawPath: "/admin/v1/delivery-zones",
    body: body === undefined ? undefined : JSON.stringify(body),
    pathParameters,
    requestContext: { requestId: "req-1", authorizer: { jwt: { claims: sub ? { sub } : {} } } },
  } as unknown as AuthedEvent;
}

describe("delivery handlers — authz + shape + no leakage", () => {
  afterEach(() => vi.clearAllMocks());

  it("list returns 200 with the paged DTO for any active staff (read)", async () => {
    isActiveStaff.mockResolvedValue(true);
    service.listZones.mockResolvedValue({
      items: [
        { id: "z1", code: "MEL", name: "Metro", status: "active", postcodeCount: 3, createdAt: "t", updatedAt: "t" },
      ],
      total: 1,
      page: 1,
      pageSize: 20,
    });
    const res = await listZonesHandler(event("sub-1"), ctx);
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body as string).items[0].code).toBe("MEL");
  });

  it("read is refused with 403 for a non-staff caller (isActiveStaff=false)", async () => {
    isActiveStaff.mockResolvedValue(false);
    const res = await listZonesHandler(event("nobody"), ctx);
    expect(res.statusCode).toBe(403);
    expect(service.listZones).not.toHaveBeenCalled();
  });

  it("mutate is refused with a uniform 403 for a csa (canManageDelivery=false) — never reaches the service", async () => {
    canManageDelivery.mockResolvedValue(false);
    const res = await createZoneHandler(event("csa-1", { code: "X", name: "X" }), ctx);
    expect(res.statusCode).toBe(403);
    expect(service.createZone).not.toHaveBeenCalled();
  });

  it("unauthenticated (no sub) → 401 on a mutate", async () => {
    const res = await createZoneHandler(event(undefined, { code: "X", name: "X" }), ctx);
    expect(res.statusCode).toBe(401);
    expect(canManageDelivery).not.toHaveBeenCalled();
  });

  it("a failing authz check fails closed to 503 (never an implicit allow)", async () => {
    isActiveStaff.mockRejectedValue(new Error("connection refused at 10.0.0.5:5432"));
    const res = await listZonesHandler(event("sub-1"), ctx);
    expect(res.statusCode).toBe(503);
    expect(res.body as string).not.toContain("10.0.0.5");
  });

  it("create zone returns 201 with the DTO on success", async () => {
    canManageDelivery.mockResolvedValue(true);
    service.createZone.mockResolvedValue({
      id: "z1", code: "MEL", name: "Metro", status: "active", postcodeCount: 0, createdAt: "t", updatedAt: "t",
    });
    const res = await createZoneHandler(event("admin-1", { code: "MEL", name: "Metro" }), ctx);
    expect(res.statusCode).toBe(201);
    expect(JSON.parse(res.body as string).id).toBe("z1");
  });

  it("create offering returns 201 with the DTO on success", async () => {
    canManageDelivery.mockResolvedValue(true);
    service.createOffering.mockResolvedValue({
      id: "o1", originZoneId: "z1", originZoneName: "A", destinationZoneId: "z2", destinationZoneName: "B",
      method: "standard", priceAmount: "5.00", leadDaysMin: 2, leadDaysMax: 3, sameDayCutoff: null,
      status: "active", createdAt: "t", updatedAt: "t",
    });
    const res = await createOfferingHandler(
      event("admin-1", { originZoneId: "z1", destinationZoneId: "z2", method: "standard", priceAmount: "5.00", leadDaysMin: 2, leadDaysMax: 3 }),
      ctx,
    );
    expect(res.statusCode).toBe(201);
    expect(JSON.parse(res.body as string).method).toBe("standard");
  });

  it("set shop location returns 200 and never leaks internals on an unexpected failure", async () => {
    canManageDelivery.mockResolvedValue(true);
    service.setShopLocation.mockRejectedValue(new Error("connection refused at 10.0.0.9:5432"));
    const res = await shopLocationHandler(event("admin-1", { postcode: "3000" }, { id: "s1" }), ctx);
    expect(res.statusCode).toBe(503);
    expect(res.body as string).not.toContain("10.0.0.9");
  });
});
