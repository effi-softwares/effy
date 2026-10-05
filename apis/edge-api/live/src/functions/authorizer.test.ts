import { beforeEach, describe, expect, it, vi } from "vitest";

const verifyToken = vi.fn();
const shopScope = vi.fn();
vi.mock("../authorize/verify", () => ({ verifyToken: (t: string) => verifyToken(t) }));
vi.mock("@effy/edge-shared/live", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@effy/edge-shared/live")>()),
  shopScope: (s: string) => shopScope(s),
  driverScope: vi.fn(),
  opsScope: vi.fn(),
}));

import { EPOCH_SECONDS } from "@effy/edge-shared/live";

import { handler } from "./authorizer";

const SHOP = "7f3c2a10-0000-4000-8000-000000000001";
const channel = () => `/shop/${SHOP}/${Math.floor(Date.now() / 1000 / EPOCH_SECONDS)}`;

beforeEach(() => {
  verifyToken.mockReset().mockResolvedValue({ audience: "shop", sub: "sub-1" });
  shopScope.mockReset().mockResolvedValue(SHOP);
});

describe("live authorizer handler", () => {
  it("answers an allowed subscription, reusable for five minutes", async () => {
    const res = await handler({
      authorizationToken: "t",
      requestContext: { operation: "EVENT_SUBSCRIBE", channel: channel() },
    });
    expect(res).toEqual({ isAuthorized: true, ttlOverride: 300 });
  });

  it("refuses when the record cannot be read, and tells the channel not to remember it", async () => {
    shopScope.mockRejectedValue(new Error("database is stopped"));
    const res = await handler({
      authorizationToken: "t",
      requestContext: { operation: "EVENT_SUBSCRIBE", channel: channel() },
    });
    expect(res).toEqual({ isAuthorized: false, ttlOverride: 0 });
  });

  it("refuses an event with nothing in it", async () => {
    expect((await handler({})).isAuthorized).toBe(false);
  });
});
