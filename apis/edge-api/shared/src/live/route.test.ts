import type { Context } from "aws-lambda";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { AuthedEvent } from "../lib/claims";
import { EPOCH_SECONDS } from "./channel";
import { liveRoute } from "./route";

const ctx = { awsRequestId: "aws-1", callbackWaitsForEmptyEventLoop: true } as unknown as Context;
const event = (claims: Record<string, unknown>): AuthedEvent =>
  ({ rawPath: "/shop/v1/live", requestContext: { requestId: "req-1", authorizer: { jwt: { claims } } } }) as unknown as AuthedEvent;

const SHOP = "7f3c2a10-0000-4000-8000-000000000001";

afterEach(() => vi.unstubAllEnvs());

function configured() {
  vi.stubEnv("LIVE_HTTP_HOST", "x.appsync-api.ap-southeast-2.amazonaws.com");
  vi.stubEnv("LIVE_REALTIME_HOST", "x.appsync-realtime-api.ap-southeast-2.amazonaws.com");
}

describe("liveRoute", () => {
  it("answers this person's channel, the epoch length and the server's clock", async () => {
    configured();
    const res = await liveRoute("shop", async () => SHOP)(event({ sub: "sub-1" }), ctx);
    expect(res.statusCode).toBe(200);
    expect(res.headers?.["cache-control"]).toBe("no-store");
    const body = JSON.parse(res.body as string) as Record<string, unknown>;
    expect(body).toEqual({
      httpHost: "x.appsync-api.ap-southeast-2.amazonaws.com",
      realtimeHost: "x.appsync-realtime-api.ap-southeast-2.amazonaws.com",
      channelPrefix: `/shop/${SHOP}`,
      epochSeconds: EPOCH_SECONDS,
      serverTime: expect.stringMatching(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/),
    });
  });

  it("resolves the scope from the verified subject, never from the request", async () => {
    configured();
    const resolve = vi.fn(async () => SHOP);
    await liveRoute("shop", resolve)(event({ sub: "sub-1" }), ctx);
    expect(resolve).toHaveBeenCalledExactlyOnceWith("sub-1");
  });

  it("is 401 with no verified subject", async () => {
    configured();
    expect((await liveRoute("shop", async () => SHOP)(event({}), ctx)).statusCode).toBe(401);
  });

  it("is 403 for a person with no active record — they have no channel", async () => {
    configured();
    const res = await liveRoute("shop", async () => null)(event({ sub: "sub-1" }), ctx);
    expect(res.statusCode).toBe(403);
    expect(res.body).not.toContain("channelPrefix");
  });

  it("is 503 when the record cannot be read — a failed check is never a grant", async () => {
    configured();
    const res = await liveRoute("shop", async () => {
      throw new Error("database is stopped");
    })(event({ sub: "sub-1" }), ctx);
    expect(res.statusCode).toBe(503);
  });

  it("is 204 where no channel exists", async () => {
    const res = await liveRoute("shop", async () => SHOP)(event({ sub: "sub-1" }), ctx);
    expect(res.statusCode).toBe(204);
  });
});
