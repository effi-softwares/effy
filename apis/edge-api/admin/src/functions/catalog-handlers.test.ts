import type { AuthedEvent } from "@effy/edge-shared";
import type { Context } from "aws-lambda";
import { afterEach, describe, expect, it, vi } from "vitest";

// Authorize from the platform record — mock the two predicates at the module boundary.
const canReadCatalog = vi.hoisted(() => vi.fn());
const canManageCatalog = vi.hoisted(() => vi.fn());
vi.mock("../catalog/authz", () => ({ canReadCatalog, canManageCatalog }));

const service = vi.hoisted(() => ({
  listProductTypes: vi.fn(),
  createProductType: vi.fn(),
}));
vi.mock("../catalog/service", () => service);

import { handler as createHandler } from "./catalog-product-types-create-v1-post";
import { handler as listHandler } from "./catalog-product-types-list-v1-get";

const ctx = { awsRequestId: "aws-1", callbackWaitsForEmptyEventLoop: true } as unknown as Context;

function event(sub: string | undefined, body?: unknown): AuthedEvent {
  return {
    rawPath: "/admin/v1/catalog/product-types",
    body: body === undefined ? undefined : JSON.stringify(body),
    requestContext: { requestId: "req-1", authorizer: { jwt: { claims: sub ? { sub } : {} } } },
  } as unknown as AuthedEvent;
}

describe("catalog handlers — authz + shape + no leakage", () => {
  afterEach(() => vi.clearAllMocks());

  it("list returns 200 with the DTO array for any active staff (read)", async () => {
    canReadCatalog.mockResolvedValue(true);
    service.listProductTypes.mockResolvedValue([
      { id: "t1", key: "prepared_food", name: "Prepared Food", description: null, status: "active", attributes: [], createdAt: "t", updatedAt: "t" },
    ]);
    const res = await listHandler(event("sub-1"), ctx);
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body as string)[0].key).toBe("prepared_food");
  });

  it("mutate is refused with 403 for a csa (canManageCatalog=false) — never reaches the service", async () => {
    canManageCatalog.mockResolvedValue(false);
    const res = await createHandler(event("csa-1", { key: "x", name: "X" }), ctx);
    expect(res.statusCode).toBe(403);
    expect(service.createProductType).not.toHaveBeenCalled();
  });

  it("unauthenticated (no sub) → 401", async () => {
    const res = await createHandler(event(undefined, { key: "x", name: "X" }), ctx);
    expect(res.statusCode).toBe(401);
  });

  it("create returns 201 with the DTO on success", async () => {
    canManageCatalog.mockResolvedValue(true);
    service.createProductType.mockResolvedValue({
      id: "t1", key: "prepared_food", name: "Prepared Food", description: null, status: "active", attributes: [], createdAt: "t", updatedAt: "t",
    });
    const res = await createHandler(event("admin-1", { key: "prepared_food", name: "Prepared Food" }), ctx);
    expect(res.statusCode).toBe(201);
    expect(JSON.parse(res.body as string).id).toBe("t1");
  });

  it("an unexpected service failure becomes a 503 that leaks NO internals", async () => {
    canManageCatalog.mockResolvedValue(true);
    service.createProductType.mockRejectedValue(new Error("connection refused at 10.0.0.5:5432"));
    const res = await createHandler(event("admin-1", { key: "prepared_food", name: "Prepared Food" }), ctx);
    expect(res.statusCode).toBe(503);
    expect(res.body as string).not.toContain("10.0.0.5");
    expect(res.body as string).not.toContain("connection refused");
  });
});
