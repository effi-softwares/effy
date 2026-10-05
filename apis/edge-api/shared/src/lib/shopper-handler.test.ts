import type { APIGatewayProxyEventV2, Context } from "aws-lambda";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ConnectionLimitError } from "./db";
import { OVERLOAD_RETRY_AFTER_SECONDS, shopperHandler } from "./shopper-handler";

const event = { rawPath: "/storefront/v1/home", requestContext: { requestId: "r1" } } as unknown as APIGatewayProxyEventV2;
const context = { awsRequestId: "a1", callbackWaitsForEmptyEventLoop: true } as unknown as Context;

afterEach(() => vi.restoreAllMocks());

describe("shopperHandler", () => {
  it("passes a handler's own response through untouched", async () => {
    const res = await shopperHandler(async () => ({ statusCode: 200, body: "ok" }))(event, context);
    expect(res).toEqual({ statusCode: 200, body: "ok" });
  });

  it("answers the connection limit as a retryable 503 and counts it", async () => {
    const out = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const res = await shopperHandler(async () => {
      throw new ConnectionLimitError();
    })(event, context);

    expect(res.statusCode).toBe(503);
    expect(res.headers?.["retry-after"]).toBe(String(OVERLOAD_RETRY_AFTER_SECONDS));
    expect(JSON.parse(res.body ?? "{}").type).toBe("https://effyshopping.com/problems/unavailable");
    expect(out.mock.calls.some((c) => String(c[0]).includes("ShopperConnectionsRefused"))).toBe(true);
  });

  it("answers anything else as the opaque 500 — the cause stays in the log", async () => {
    const res = await shopperHandler(async () => {
      throw new Error("relation \"secret_table\" does not exist");
    })(event, context);
    expect(res.statusCode).toBe(500);
    expect(res.body).not.toContain("secret_table");
  });
});
