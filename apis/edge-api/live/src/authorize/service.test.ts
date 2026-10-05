import { EPOCH_SECONDS } from "@effy/edge-shared/live";
import { describe, expect, it, vi } from "vitest";

import { authorize, type Audience, type AuthorizeDeps } from "./service";

const EPOCH = 2_932_000;
const NOW = (EPOCH * EPOCH_SECONDS + 300) * 1000;
const SHOP = "7f3c2a10-0000-4000-8000-000000000001";
const OTHER_SHOP = "7f3c2a10-0000-4000-8000-000000000002";
const DRIVER = "d0000000-0000-4000-8000-000000000001";

function deps(audience: Audience | null, over: Partial<AuthorizeDeps> = {}): AuthorizeDeps {
  return {
    verify: vi.fn(async () => (audience ? { audience, sub: "sub-1" } : null)),
    shopScope: vi.fn(async () => SHOP),
    driverScope: vi.fn(async () => DRIVER),
    opsScope: vi.fn(async () => true),
    now: () => NOW,
    ...over,
  };
}

const subscribe = (channel: string | null) => ({ operation: "EVENT_SUBSCRIBE", token: "t", channel });

describe("connect", () => {
  it.each<Audience>(["customer", "shop", "driver", "back-office"])("a valid %s token may connect", async (a) => {
    const d = deps(a);
    expect(await authorize({ operation: "EVENT_CONNECT", token: "t", channel: null }, d)).toMatchObject({
      isAuthorized: true,
    });
    // Connecting reads no record: a customer burst opening order pages costs the database nothing.
    expect(d.shopScope).not.toHaveBeenCalled();
    expect(d.driverScope).not.toHaveBeenCalled();
    expect(d.opsScope).not.toHaveBeenCalled();
  });

  it("a token that does not verify may not", async () => {
    expect(await authorize({ operation: "EVENT_CONNECT", token: "t", channel: null }, deps(null))).toEqual({
      isAuthorized: false,
      outcome: "bad_token",
      audience: undefined,
    });
  });
});

describe("subscribe — own channel", () => {
  it("a shop operator hears their own shop, this epoch and the next", async () => {
    expect((await authorize(subscribe(`/shop/${SHOP}/${EPOCH}`), deps("shop"))).isAuthorized).toBe(true);
    expect((await authorize(subscribe(`/shop/${SHOP}/${EPOCH + 1}`), deps("shop"))).isAuthorized).toBe(true);
  });

  it("a driver hears their own work", async () => {
    expect((await authorize(subscribe(`/driver/${DRIVER}/${EPOCH}`), deps("driver"))).isAuthorized).toBe(true);
  });

  it("back-office hears operations", async () => {
    expect((await authorize(subscribe(`/ops/all/${EPOCH}`), deps("back-office"))).isAuthorized).toBe(true);
  });

  it("a customer hears their own subject, with no record read", async () => {
    const d = deps("customer");
    expect((await authorize(subscribe(`/customer/sub-1/${EPOCH}`), d)).isAuthorized).toBe(true);
    expect(d.shopScope).not.toHaveBeenCalled();
    expect(d.driverScope).not.toHaveBeenCalled();
    expect(d.opsScope).not.toHaveBeenCalled();
  });
});

describe("subscribe — refusals", () => {
  it("another shop's channel", async () => {
    expect(await authorize(subscribe(`/shop/${OTHER_SHOP}/${EPOCH}`), deps("shop"))).toMatchObject({
      isAuthorized: false,
      outcome: "wrong_scope",
    });
  });

  it("another customer's channel", async () => {
    expect(await authorize(subscribe(`/customer/sub-2/${EPOCH}`), deps("customer"))).toMatchObject({
      isAuthorized: false,
      outcome: "wrong_scope",
    });
  });

  it("another driver's channel", async () => {
    const other = "d0000000-0000-4000-8000-000000000002";
    expect(await authorize(subscribe(`/driver/${other}/${EPOCH}`), deps("driver"))).toMatchObject({
      isAuthorized: false,
      outcome: "wrong_scope",
    });
  });

  it.each<[Audience, string]>([
    ["customer", `/shop/${SHOP}/${EPOCH}`],
    ["customer", `/ops/all/${EPOCH}`],
    ["customer", `/driver/${DRIVER}/${EPOCH}`],
    ["shop", `/ops/all/${EPOCH}`],
    ["shop", `/customer/sub-1/${EPOCH}`],
    ["driver", `/shop/${SHOP}/${EPOCH}`],
    ["driver", `/ops/all/${EPOCH}`],
    ["back-office", `/shop/${SHOP}/${EPOCH}`],
    ["back-office", `/customer/sub-1/${EPOCH}`],
  ])("a %s token in another audience's namespace (%s)", async (audience, channel) => {
    const d = deps(audience);
    expect(await authorize(subscribe(channel), d)).toMatchObject({ isAuthorized: false, outcome: "wrong_audience" });
    // Refused on the namespace alone — no record is read to decide it.
    expect(d.shopScope).not.toHaveBeenCalled();
  });

  it.each([`/shop/${SHOP}/*`, "/shop/*", `/shop/*/${EPOCH}`, "/*", `/shop/${SHOP}`, `/shop/${SHOP}/${EPOCH}/x`, ""])(
    "a wildcard or malformed channel (%j)",
    async (channel) => {
      expect(await authorize(subscribe(channel), deps("shop"))).toMatchObject({
        isAuthorized: false,
        outcome: "bad_channel",
      });
    },
  );

  it("no channel at all", async () => {
    expect(await authorize(subscribe(null), deps("shop"))).toMatchObject({ outcome: "bad_channel" });
  });

  it.each([EPOCH - 1, EPOCH + 2, 0])("an epoch that is not this one or the next (%d)", async (epoch) => {
    expect(await authorize(subscribe(`/shop/${SHOP}/${epoch}`), deps("shop"))).toMatchObject({
      isAuthorized: false,
      outcome: "stale_epoch",
    });
  });

  it("an operator with no active record", async () => {
    const d = deps("shop", { shopScope: vi.fn(async () => null) });
    expect(await authorize(subscribe(`/shop/${SHOP}/${EPOCH}`), d)).toMatchObject({
      isAuthorized: false,
      outcome: "no_record",
    });
  });

  it("a driver with no active record", async () => {
    const d = deps("driver", { driverScope: vi.fn(async () => null) });
    expect(await authorize(subscribe(`/driver/${DRIVER}/${EPOCH}`), d)).toMatchObject({ outcome: "no_record" });
  });

  it("a back-office account that is not active", async () => {
    const d = deps("back-office", { opsScope: vi.fn(async () => false) });
    expect(await authorize(subscribe(`/ops/all/${EPOCH}`), d)).toMatchObject({ outcome: "no_record" });
  });

  it("a token that does not verify", async () => {
    expect(await authorize(subscribe(`/shop/${SHOP}/${EPOCH}`), deps(null))).toMatchObject({
      isAuthorized: false,
      outcome: "bad_token",
    });
  });
});

describe("publish and anything else", () => {
  it("a client may never publish — refused before the token is read", async () => {
    const d = deps("back-office");
    expect(await authorize({ operation: "EVENT_PUBLISH", token: "t", channel: `/ops/all/${EPOCH}` }, d)).toMatchObject({
      isAuthorized: false,
      outcome: "publish_refused",
    });
    expect(d.verify).not.toHaveBeenCalled();
  });

  it("an operation this build has never heard of is refused", async () => {
    expect(await authorize({ operation: "EVENT_SOMETHING", token: "t", channel: null }, deps("shop"))).toMatchObject({
      isAuthorized: false,
      outcome: "unknown_operation",
    });
  });
});
