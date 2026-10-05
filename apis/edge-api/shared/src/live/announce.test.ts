import { afterEach, describe, expect, it, vi } from "vitest";

import { announce, type LiveChange } from "./announce";
import { EPOCH_SECONDS } from "./channel";

const ENV = {
  LIVE_HTTP_HOST: "example.appsync-api.ap-southeast-2.amazonaws.com",
  AWS_REGION: "ap-southeast-2",
  AWS_ACCESS_KEY_ID: "AKIDEXAMPLE",
  AWS_SECRET_ACCESS_KEY: "secret",
  AWS_SESSION_TOKEN: "token",
} as NodeJS.ProcessEnv;

// Five minutes into epoch 100: well clear of the boundary margin, so one epoch is published to.
const MID_EPOCH = () => (100 * EPOCH_SECONDS + 300) * 1000;
const JUST_AFTER_BOUNDARY = () => (100 * EPOCH_SECONDS + 5) * 1000;

const ok = () => new Response("{}", { status: 200 });
const sent = (fetchMock: ReturnType<typeof vi.fn>) =>
  fetchMock.mock.calls.map(([, init]) => JSON.parse((init as RequestInit).body as string) as {
    channel: string;
    events: string[];
  });

const SHOP = "7f3c2a10-0000-4000-8000-000000000001";

afterEach(() => vi.restoreAllMocks());

describe("announce", () => {
  it("publishes the kind and nothing else to the scope's current channel", async () => {
    const fetchMock = vi.fn(async () => ok());
    await announce([{ scope: "shop", shopId: SHOP, kind: "orders" }], { fetch: fetchMock, now: MID_EPOCH, env: ENV });

    expect(sent(fetchMock)).toEqual([{ channel: `/shop/${SHOP}/100`, events: ['{"k":"orders"}'] }]);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`https://${ENV.LIVE_HTTP_HOST}/event`);
    expect((init.headers as Record<string, string>).authorization).toMatch(/^AWS4-HMAC-SHA256 /);
  });

  it("sends one request per channel however many times a change is named", async () => {
    const fetchMock = vi.fn(async () => ok());
    const changes: LiveChange[] = [
      { scope: "shop", shopId: SHOP, kind: "orders" },
      { scope: "shop", shopId: SHOP, kind: "orders" },
      { scope: "shop", shopId: SHOP, kind: "stock" },
      { scope: "ops", kind: "orders" },
      { scope: "ops", kind: "orders" },
    ];
    await announce(changes, { fetch: fetchMock, now: MID_EPOCH, env: ENV });

    const bodies = sent(fetchMock).sort((a, b) => a.channel.localeCompare(b.channel));
    expect(bodies).toEqual([
      { channel: "/ops/all/100", events: ['{"k":"orders"}'] },
      { channel: `/shop/${SHOP}/100`, events: ['{"k":"orders"}', '{"k":"stock"}'] },
    ]);
  });

  it("also publishes to the previous epoch just after a boundary", async () => {
    const fetchMock = vi.fn(async () => ok());
    await announce([{ scope: "driver", driverId: "d-1", kind: "work" }], {
      fetch: fetchMock,
      now: JUST_AFTER_BOUNDARY,
      env: ENV,
    });
    expect(sent(fetchMock).map((b) => b.channel).sort()).toEqual(["/driver/d-1/100", "/driver/d-1/99"]);
  });

  it("retries once, then resolves", async () => {
    const fetchMock = vi.fn().mockRejectedValueOnce(new Error("reset")).mockResolvedValueOnce(ok());
    await expect(
      announce([{ scope: "ops", kind: "slots" }], { fetch: fetchMock, now: MID_EPOCH, env: ENV }),
    ).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("resolves when every attempt throws — the change it follows has already succeeded", async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error("channel unreachable");
    });
    await expect(
      announce([{ scope: "customer", sub: "sub-1", kind: "orders" }], { fetch: fetchMock, now: MID_EPOCH, env: ENV }),
    ).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("resolves when the service refuses the publish", async () => {
    const fetchMock = vi.fn(async () => new Response("{}", { status: 403 }));
    await expect(
      announce([{ scope: "ops", kind: "review" }], { fetch: fetchMock, now: MID_EPOCH, env: ENV }),
    ).resolves.toBeUndefined();
  });

  it("counts what was sent and what was not, by kind only", async () => {
    const lines: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
      lines.push(String(chunk));
      return true;
    });
    const fetchMock = vi
      .fn()
      .mockImplementation(async (_url: string, init: RequestInit) =>
        String(init.body).includes("/ops/") ? new Response("{}", { status: 500 }) : ok(),
      );
    await announce(
      [
        { scope: "shop", shopId: SHOP, kind: "orders" },
        { scope: "ops", kind: "dispatch" },
      ],
      { fetch: fetchMock, now: MID_EPOCH, env: ENV },
    );

    const metrics = lines.filter((l) => l.includes('"_aws"')).map((l) => JSON.parse(l) as Record<string, unknown>);
    expect(metrics).toContainEqual(expect.objectContaining({ UpdatesSent: 1, kind: "orders" }));
    expect(metrics).toContainEqual(expect.objectContaining({ UpdateSendFailures: 1, kind: "dispatch" }));
    // No line names whose update it was.
    expect(lines.join("")).not.toContain(SHOP);
  });

  it("skips a scope id that cannot be a channel segment and still sends the rest", async () => {
    const fetchMock = vi.fn(async () => ok());
    await announce(
      [
        { scope: "shop", shopId: "not a segment", kind: "orders" },
        { scope: "ops", kind: "orders" },
      ],
      { fetch: fetchMock, now: MID_EPOCH, env: ENV },
    );
    expect(sent(fetchMock).map((b) => b.channel)).toEqual(["/ops/all/100"]);
  });

  it("does nothing where no channel is configured", async () => {
    const fetchMock = vi.fn(async () => ok());
    await announce([{ scope: "ops", kind: "orders" }], { fetch: fetchMock, now: MID_EPOCH, env: {} });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does nothing for no changes", async () => {
    const fetchMock = vi.fn(async () => ok());
    await announce([], { fetch: fetchMock, now: MID_EPOCH, env: ENV });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
