import type { AuthedEvent } from "@effy/edge-shared";
import type { Context } from "aws-lambda";
import { afterEach, describe, expect, it, vi } from "vitest";

// Authorize from the platform record — mock the membership predicate at the module boundary.
const authorizeShopMember = vi.hoisted(() => vi.fn());
vi.mock("../products/authz", () => ({ authorizeShopMember }));

const service = vi.hoisted(() => ({
  listProducts: vi.fn(),
  createProduct: vi.fn(),
}));
vi.mock("../products/service", () => service);

import { handler as createHandler } from "./product-create-v1-post";
import { handler as listHandler } from "./products-list-v1-get";

const ctx = { awsRequestId: "aws-1", callbackWaitsForEmptyEventLoop: true } as unknown as Context;

function event(sub: string | undefined, body?: unknown, qs?: Record<string, string>): AuthedEvent {
  return {
    rawPath: "/shop/v1/products",
    body: body === undefined ? undefined : JSON.stringify(body),
    queryStringParameters: qs,
    requestContext: { requestId: "req-1", authorizer: { jwt: { claims: sub ? { sub } : {} } } },
  } as unknown as AuthedEvent;
}

describe("shop product handlers — gate + shop-scope + no leakage", () => {
  afterEach(() => vi.clearAllMocks());

  it("401 when unauthenticated", async () => {
    const res = await listHandler(event(undefined), ctx);
    expect(res.statusCode).toBe(401);
  });

  it("403 when the caller is not an active member of an active shop", async () => {
    authorizeShopMember.mockResolvedValue(null);
    const res = await listHandler(event("sub-1"), ctx);
    expect(res.statusCode).toBe(403);
    expect(service.listProducts).not.toHaveBeenCalled();
  });

  it("scopes the list to the RESOLVED shop id (not client input)", async () => {
    authorizeShopMember.mockResolvedValue("shop-authoritative");
    service.listProducts.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20 });
    // A client trying to inject a different shopId in the query string must be ignored.
    await listHandler(event("sub-1", undefined, { shopId: "shop-attacker" }), ctx);
    expect(service.listProducts.mock.calls[0]![0]).toBe("shop-authoritative");
  });

  it("create returns 201 with the detail DTO", async () => {
    authorizeShopMember.mockResolvedValue("shop-1");
    service.createProduct.mockResolvedValue({
      id: "p1", shopId: "shop-1", productTypeId: "t", typeName: "T", primaryCategoryId: "c", categoryName: "C",
      name: "X", sku: null, gtin: null, brand: null, priceAmount: "1.00", currency: "AUD", compareAtAmount: null,
      shortDescription: "d", longDescription: null, status: "draft", attributes: [], media: [], sections: [],
      missingMandatoryAttributes: [], createdAt: "t", updatedAt: "t",
    });
    const res = await createHandler(event("sub-1", { productTypeId: "t", primaryCategoryId: "c", name: "X", priceAmount: "1.00", shortDescription: "d" }), ctx);
    expect(res.statusCode).toBe(201);
    expect(JSON.parse(res.body as string).id).toBe("p1");
  });

  it("an unexpected failure → 503 leaking no internals", async () => {
    authorizeShopMember.mockResolvedValue("shop-1");
    service.createProduct.mockRejectedValue(new Error("pg connect ECONNREFUSED 10.1.2.3"));
    const res = await createHandler(event("sub-1", { name: "X" }), ctx);
    expect(res.statusCode).toBe(503);
    expect(res.body as string).not.toContain("10.1.2.3");
  });
});
