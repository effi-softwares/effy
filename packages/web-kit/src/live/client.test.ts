import type { LiveDescriptor } from "@effy/shared-types";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createLiveClient, type LiveClientOptions, type LiveSocket, type LiveState } from "./client";

const EPOCH_SECONDS = 600;
const EPOCH = 2_932_000;
/** Five minutes into the epoch, by the server's clock. */
const SERVER_NOW = (EPOCH * EPOCH_SECONDS + 300) * 1000;
const PREFIX = "/shop/7f3c2a10-0000-4000-8000-000000000001";

class FakeSocket implements LiveSocket {
  sent: Array<Record<string, unknown>> = [];
  closed = false;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(
    readonly url: string,
    readonly protocols: string[],
  ) {}
  send(data: string) {
    this.sent.push(JSON.parse(data) as Record<string, unknown>);
  }
  close() {
    this.closed = true;
  }
  receive(message: unknown) {
    this.onmessage?.({ data: typeof message === "string" ? message : JSON.stringify(message) });
  }
  ofType(type: string) {
    return this.sent.filter((m) => m.type === type);
  }
}

interface Harness {
  sockets: FakeSocket[];
  states: LiveState[];
  updates: string[];
  caughtUp: ReturnType<typeof vi.fn>;
  options: LiveClientOptions;
  /** Open the newest socket and take it through to a live subscription. */
  goLive(): Promise<FakeSocket>;
}

const descriptor = (): LiveDescriptor => ({
  httpHost: "x.appsync-api.ap-southeast-2.amazonaws.com",
  realtimeHost: "x.appsync-realtime-api.ap-southeast-2.amazonaws.com",
  channelPrefix: PREFIX,
  epochSeconds: EPOCH_SECONDS,
  serverTime: new Date(Date.now()).toISOString(),
});

function harness(over: Partial<LiveClientOptions> = {}): Harness {
  const h: Harness = {
    sockets: [],
    states: [],
    updates: [],
    caughtUp: vi.fn(),
    options: undefined as unknown as LiveClientOptions,
    async goLive() {
      await vi.advanceTimersByTimeAsync(0);
      const s = h.sockets.at(-1)!;
      s.onopen?.();
      s.receive({ type: "connection_ack", connectionTimeoutMs: 300_000 });
      await vi.advanceTimersByTimeAsync(0);
      const sub = s.ofType("subscribe").at(-1)!;
      s.receive({ type: "subscribe_success", id: sub.id });
      return s;
    },
  };
  h.options = {
    loadDescriptor: vi.fn(async () => descriptor()),
    getToken: vi.fn(async () => "token-1"),
    onUpdate: (kind) => h.updates.push(kind),
    onCaughtUp: h.caughtUp,
    onState: (s) => h.states.push(s),
    createSocket: (url, protocols) => {
      const s = new FakeSocket(url, protocols);
      h.sockets.push(s);
      return s;
    },
    random: () => 1,
    ...over,
  };
  return h;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(SERVER_NOW);
});
afterEach(() => vi.useRealTimers());

describe("connecting", () => {
  it("opens the socket with the two subprotocols, the second carrying host and token", async () => {
    const h = harness();
    createLiveClient(h.options).start();
    await vi.advanceTimersByTimeAsync(0);

    const s = h.sockets[0]!;
    expect(s.url).toBe("wss://x.appsync-realtime-api.ap-southeast-2.amazonaws.com/event/realtime");
    expect(s.protocols[0]).toBe("aws-appsync-event-ws");
    const header = s.protocols[1]!.replace(/^header-/, "");
    expect(header).not.toMatch(/[+/=]/);
    const decoded = JSON.parse(atob(header.replace(/-/g, "+").replace(/_/g, "/"))) as Record<string, string>;
    expect(decoded).toEqual({ host: "x.appsync-api.ap-southeast-2.amazonaws.com", Authorization: "token-1" });
  });

  it("subscribes to this epoch's channel, goes live, and asks for one catch-up read", async () => {
    const h = harness();
    const client = createLiveClient(h.options);
    client.start();
    const s = await h.goLive();

    expect(s.ofType("connection_init")).toHaveLength(1);
    expect(s.ofType("subscribe")).toEqual([
      {
        type: "subscribe",
        id: expect.any(String),
        channel: `${PREFIX}/${EPOCH}`,
        authorization: { Authorization: "token-1", host: "x.appsync-api.ap-southeast-2.amazonaws.com" },
      },
    ]);
    expect(client.state()).toBe("live");
    expect(h.states).toEqual(["reconnecting", "live"]);
    expect(h.caughtUp).toHaveBeenCalledTimes(1);
  });

  it("never sends a publish", async () => {
    const h = harness();
    createLiveClient(h.options).start();
    const s = await h.goLive();
    s.receive({ type: "data", id: s.ofType("subscribe")[0]!.id, event: ['{"k":"orders"}'] });
    await vi.advanceTimersByTimeAsync(EPOCH_SECONDS * 3 * 1000);
    expect(h.sockets.flatMap((x) => x.ofType("publish"))).toEqual([]);
  });

  it("picks the epoch from the server's clock, not a wrong device clock", async () => {
    // The device believes it is forty minutes earlier than the server does.
    const h = harness({
      loadDescriptor: vi.fn(async () => ({ ...descriptor(), serverTime: new Date(Date.now() + 40 * 60_000).toISOString() })),
    });
    createLiveClient(h.options).start();
    const s = await h.goLive();
    expect(s.ofType("subscribe")[0]!.channel).toBe(`${PREFIX}/${EPOCH + 4}`);
  });
});

describe("updates", () => {
  it("passes on the kind of each update for its own subscription", async () => {
    const h = harness();
    createLiveClient(h.options).start();
    const s = await h.goLive();
    const id = s.ofType("subscribe")[0]!.id;

    s.receive({ type: "data", id, event: ['{"k":"orders"}', '{"k":"stock"}'] });
    expect(h.updates).toEqual(["orders", "stock"]);
  });

  it("ignores an unknown kind, an invalid frame, and data for a subscription it does not hold", async () => {
    const h = harness();
    createLiveClient(h.options).start();
    const s = await h.goLive();
    const id = s.ofType("subscribe")[0]!.id;

    s.receive({ type: "data", id, event: ['{"k":"prices"}'] });
    s.receive({ type: "data", id, event: ["not json"] });
    s.receive("not json at all");
    s.receive({ type: "data", id: "someone-else", event: ['{"k":"orders"}'] });
    s.receive({ type: "something_new" });
    expect(h.updates).toEqual([]);
  });
});

describe("no channel, and refusal", () => {
  it("is off when signed out — and opens nothing", async () => {
    const h = harness({ getToken: vi.fn(async () => null) });
    const client = createLiveClient(h.options);
    client.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(client.state()).toBe("off");
    expect(h.sockets).toHaveLength(0);
  });

  it("is off when there is no channel for this person, and does not keep asking", async () => {
    const h = harness({ loadDescriptor: vi.fn(async () => null) });
    const client = createLiveClient(h.options);
    client.start();
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(client.state()).toBe("off");
    expect(h.options.loadDescriptor).toHaveBeenCalledTimes(1);
  });

  it("is off when the subscription is refused, and does not retry", async () => {
    const h = harness();
    const client = createLiveClient(h.options);
    client.start();
    await vi.advanceTimersByTimeAsync(0);
    const s = h.sockets[0]!;
    s.onopen?.();
    s.receive({ type: "connection_ack", connectionTimeoutMs: 300_000 });
    await vi.advanceTimersByTimeAsync(0);
    s.receive({ type: "subscribe_error", id: s.ofType("subscribe")[0]!.id, errors: [{ errorType: "Unauthorized" }] });

    expect(client.state()).toBe("off");
    expect(s.closed).toBe(true);
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(h.sockets).toHaveLength(1);
    expect(h.caughtUp).not.toHaveBeenCalled();
  });

  it("start() tries again after being off", async () => {
    const getToken = vi.fn<() => Promise<string | null>>().mockResolvedValueOnce(null).mockResolvedValue("token-1");
    const h = harness({ getToken });
    const client = createLiveClient(h.options);
    client.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(client.state()).toBe("off");
    client.start();
    await h.goLive();
    expect(client.state()).toBe("live");
  });
});

describe("losing the connection", () => {
  it("reconnects with backoff and asks for a catch-up read when it is back", async () => {
    const h = harness();
    const client = createLiveClient(h.options);
    client.start();
    const first = await h.goLive();

    first.onclose?.();
    expect(client.state()).toBe("reconnecting");
    await vi.advanceTimersByTimeAsync(999);
    expect(h.sockets).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    await h.goLive();

    expect(h.sockets).toHaveLength(2);
    expect(client.state()).toBe("live");
    expect(h.caughtUp).toHaveBeenCalledTimes(2);
    // The descriptor is read again on reconnect — the person's channel may have changed.
    expect(h.options.loadDescriptor).toHaveBeenCalledTimes(2);
  });

  it("doubles the wait each time, up to a minute", async () => {
    const h = harness({
      loadDescriptor: vi.fn(async () => {
        throw new Error("offline");
      }),
    });
    createLiveClient(h.options).start();
    await vi.advanceTimersByTimeAsync(0);
    const calls = () => (h.options.loadDescriptor as ReturnType<typeof vi.fn>).mock.calls.length;

    expect(calls()).toBe(1);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(calls()).toBe(2);
    await vi.advanceTimersByTimeAsync(2_000);
    expect(calls()).toBe(3);
    await vi.advanceTimersByTimeAsync(4_000);
    expect(calls()).toBe(4);
    // Many failures later the wait is capped at a minute, not growing without bound.
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    const before = calls();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(calls()).toBe(before + 1);
  });

  it("treats a connection with no keep-alive as dead", async () => {
    const h = harness();
    const client = createLiveClient(h.options);
    client.start();
    const s = await h.goLive();

    await vi.advanceTimersByTimeAsync(200_000);
    s.receive({ type: "ka" });
    await vi.advanceTimersByTimeAsync(200_000);
    expect(client.state()).toBe("live"); // the keep-alive re-armed the watchdog

    // Stop the epoch roll from muddying this: only the watchdog is under test.
    await vi.advanceTimersByTimeAsync(300_000);
    expect(s.closed).toBe(true);
    expect(client.state()).not.toBe("off");
  });

  it("retryNow() skips the wait", async () => {
    const h = harness();
    const client = createLiveClient(h.options);
    client.start();
    const first = await h.goLive();
    first.onclose?.();
    first.onclose = null;

    client.retryNow();
    await h.goLive();
    expect(h.sockets).toHaveLength(2);
    expect(client.state()).toBe("live");
  });

  it("stop() closes and stays closed", async () => {
    const h = harness();
    const client = createLiveClient(h.options);
    client.start();
    const s = await h.goLive();
    client.stop();

    expect(s.closed).toBe(true);
    expect(client.state()).toBe("off");
    await vi.advanceTimersByTimeAsync(60 * 60_000);
    expect(h.sockets).toHaveLength(1);
  });
});

describe("moving to the next epoch", () => {
  it("subscribes to the next channel a minute early and drops the old one a minute after", async () => {
    const h = harness();
    const client = createLiveClient(h.options);
    client.start();
    const s = await h.goLive();
    const firstId = s.ofType("subscribe")[0]!.id;

    // 300 s into the epoch → the boundary is 300 s away; the next subscription goes out at 240 s.
    await vi.advanceTimersByTimeAsync(239_000);
    s.receive({ type: "ka" });
    expect(s.ofType("subscribe")).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1_000);
    await vi.advanceTimersByTimeAsync(0);
    expect(s.ofType("subscribe")).toHaveLength(2);
    expect(s.ofType("subscribe")[1]!.channel).toBe(`${PREFIX}/${EPOCH + 1}`);

    const secondId = s.ofType("subscribe")[1]!.id;
    s.receive({ type: "subscribe_success", id: secondId });
    // No second catch-up: nothing was missed, both channels were held across the boundary.
    expect(h.caughtUp).toHaveBeenCalledTimes(1);

    // Updates on either channel are heard during the overlap.
    s.receive({ type: "data", id: firstId, event: ['{"k":"orders"}'] });
    s.receive({ type: "data", id: secondId, event: ['{"k":"orders"}'] });
    expect(h.updates).toEqual(["orders", "orders"]);

    // Boundary + one minute: the old channel is dropped.
    await vi.advanceTimersByTimeAsync(119_000);
    s.receive({ type: "ka" });
    expect(s.ofType("unsubscribe")).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(s.ofType("unsubscribe")).toEqual([{ type: "unsubscribe", id: firstId }]);
    expect(client.state()).toBe("live");
  });

  it("asks for a fresh token for each epoch's subscription", async () => {
    const getToken = vi
      .fn<() => Promise<string | null>>()
      .mockResolvedValueOnce("token-1") // handshake
      .mockResolvedValueOnce("token-1") // first subscribe
      .mockResolvedValue("token-2");
    const h = harness({ getToken });
    createLiveClient(h.options).start();
    const s = await h.goLive();
    await vi.advanceTimersByTimeAsync(240_000);
    await vi.advanceTimersByTimeAsync(0);
    expect((s.ofType("subscribe")[1]!.authorization as { Authorization: string }).Authorization).toBe("token-2");
  });

  // FR-023 / SC-009 — this is the mechanism by which a person whose access has ended stops hearing.
  it("goes off when the next epoch's subscription is refused — access has ended", async () => {
    const h = harness();
    const client = createLiveClient(h.options);
    client.start();
    const s = await h.goLive();
    await vi.advanceTimersByTimeAsync(240_000);
    await vi.advanceTimersByTimeAsync(0);

    s.receive({ type: "subscribe_error", id: s.ofType("subscribe")[1]!.id });
    expect(client.state()).toBe("off");
    expect(s.closed).toBe(true);

    // And nothing that arrives afterwards is passed on.
    s.receive({ type: "data", id: s.ofType("subscribe")[0]!.id, event: ['{"k":"orders"}'] });
    expect(h.updates).toEqual([]);
  });

  it("goes off when the session has ended by the time the next epoch is due", async () => {
    const getToken = vi
      .fn<() => Promise<string | null>>()
      .mockResolvedValueOnce("token-1")
      .mockResolvedValueOnce("token-1")
      .mockResolvedValue(null);
    const h = harness({ getToken });
    const client = createLiveClient(h.options);
    client.start();
    await h.goLive();
    await vi.advanceTimersByTimeAsync(240_000);
    await vi.advanceTimersByTimeAsync(0);
    expect(client.state()).toBe("off");
  });
});

describe("idle", () => {
  // SC-003 — an hour connected and idle: keep-alives and epoch subscriptions only. The descriptor
  // (the one thing here that is a request to the gateway) is read once.
  it("reads the descriptor once in an hour of idle connection", async () => {
    const h = harness();
    const client = createLiveClient(h.options);
    client.start();
    const s = await h.goLive();

    for (let second = 0; second < 3600; second += 30) {
      await vi.advanceTimersByTimeAsync(30_000);
      s.receive({ type: "ka" });
      const pending = s.ofType("subscribe").at(-1)!;
      s.receive({ type: "subscribe_success", id: pending.id });
    }

    expect(client.state()).toBe("live");
    expect(h.options.loadDescriptor).toHaveBeenCalledTimes(1);
    expect(h.caughtUp).toHaveBeenCalledTimes(1);
    expect(h.sockets).toHaveLength(1);
    // One subscription per ten-minute epoch, give or take the first.
    expect(s.ofType("subscribe").length).toBeGreaterThanOrEqual(6);
    expect(s.ofType("subscribe").length).toBeLessThanOrEqual(8);
  });
});
