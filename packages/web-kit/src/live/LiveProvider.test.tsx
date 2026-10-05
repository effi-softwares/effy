import type { LiveDescriptor } from "@effy/shared-types";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LiveStatus } from "../console/LiveStatus";
import { LiveProvider } from "./LiveProvider";

/** A stand-in for the browser's WebSocket that the test drives by hand. */
class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  sent: Array<Record<string, unknown>> = [];
  closed = false;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(readonly url: string) {
    FakeWebSocket.instances.push(this);
  }
  send(data: string) {
    this.sent.push(JSON.parse(data) as Record<string, unknown>);
  }
  close() {
    this.closed = true;
  }
  receive(message: unknown) {
    this.onmessage?.({ data: JSON.stringify(message) });
  }
  subscriptionId() {
    return this.sent.filter((m) => m.type === "subscribe").at(-1)!.id;
  }
}

const descriptor = (): LiveDescriptor => ({
  httpHost: "x.appsync-api.example",
  realtimeHost: "x.appsync-realtime-api.example",
  channelPrefix: "/shop/abc",
  epochSeconds: 600,
  serverTime: new Date(Date.now()).toISOString(),
});

const reads = { orders: 0, stock: 0, other: 0 };

function Orders() {
  useQuery({ queryKey: ["shop", "orders", "list"], queryFn: async () => ++reads.orders });
  return null;
}
function Stock() {
  useQuery({ queryKey: ["shop", "stock"], queryFn: async () => ++reads.stock });
  return null;
}
function Unrelated() {
  useQuery({ queryKey: ["shop", "insights"], queryFn: async () => ++reads.other });
  return null;
}

const ROUTES = { orders: [["shop", "orders"]], stock: [["shop", "stock"]] } as const;

function mount(over: { enabled?: boolean; loadDescriptor?: () => Promise<LiveDescriptor | null> } = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  const ui = (enabled: boolean) => (
    <QueryClientProvider client={queryClient}>
      <LiveProvider
        enabled={enabled}
        loadDescriptor={over.loadDescriptor ?? (async () => descriptor())}
        getToken={async () => "token"}
        routes={ROUTES}
      >
        <LiveStatus />
        <Orders />
        <Stock />
        <Unrelated />
        <input aria-label="note" defaultValue="" />
      </LiveProvider>
    </QueryClientProvider>
  );
  const view = render(ui(over.enabled ?? true));
  return { ...view, setEnabled: (enabled: boolean) => view.rerender(ui(enabled)) };
}

const flush = () => act(() => vi.advanceTimersByTimeAsync(0));

async function goLive(): Promise<FakeWebSocket> {
  await flush();
  const socket = FakeWebSocket.instances.at(-1)!;
  await act(async () => {
    socket.onopen?.();
    socket.receive({ type: "connection_ack", connectionTimeoutMs: 300_000 });
    await vi.advanceTimersByTimeAsync(0);
    socket.receive({ type: "subscribe_success", id: socket.subscriptionId() });
    await vi.advanceTimersByTimeAsync(0);
  });
  return socket;
}

function setVisibility(state: "visible" | "hidden") {
  Object.defineProperty(document, "visibilityState", { value: state, configurable: true });
  document.dispatchEvent(new Event("visibilitychange"));
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-05T03:05:00Z"));
  FakeWebSocket.instances = [];
  reads.orders = reads.stock = reads.other = 0;
  vi.stubGlobal("WebSocket", FakeWebSocket);
  setVisibility("visible");
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("LiveProvider", () => {
  it("re-reads only the queries that show the kind that changed", async () => {
    mount();
    const socket = await goLive();
    const before = { ...reads };

    await act(async () => {
      socket.receive({ type: "data", id: socket.subscriptionId(), event: ['{"k":"orders"}'] });
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(reads.orders).toBe(before.orders + 1);
    expect(reads.stock).toBe(before.stock);
    expect(reads.other).toBe(before.other);
  });

  it("reads everything it maps once when the channel connects, and nothing it does not map", async () => {
    mount();
    await flush();
    const before = { ...reads };
    await goLive();
    expect(reads.orders).toBe(before.orders + 1);
    expect(reads.stock).toBe(before.stock + 1);
    expect(reads.other).toBe(before.other);
  });

  // SC-003 — an hour open and idle: no repeated requests for the data on screen.
  it("makes no reads while idle for an hour", async () => {
    mount();
    const socket = await goLive();
    const before = { ...reads };

    for (let i = 0; i < 120; i++) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(30_000);
        socket.receive({ type: "ka" });
        socket.receive({ type: "subscribe_success", id: socket.subscriptionId() });
      });
    }
    expect(reads).toEqual(before);
  });

  // SC-012
  it("reads no more than three times for a burst of ten updates in ten seconds", async () => {
    mount();
    const socket = await goLive();
    const before = reads.orders;

    for (let i = 0; i < 10; i++) {
      await act(async () => {
        socket.receive({ type: "data", id: socket.subscriptionId(), event: ['{"k":"orders"}'] });
        await vi.advanceTimersByTimeAsync(900);
      });
    }
    await act(() => vi.advanceTimersByTimeAsync(10_000));

    const burstReads = reads.orders - before;
    expect(burstReads).toBeGreaterThanOrEqual(2);
    expect(burstReads).toBeLessThanOrEqual(3);
  });

  // SC-004 — back after a lost connection: the current state without the person doing anything.
  it("reads once when the connection returns", async () => {
    mount();
    const first = await goLive();
    const before = { ...reads };

    await act(async () => {
      first.onclose?.();
      await vi.advanceTimersByTimeAsync(1_000);
    });
    await goLive();

    expect(FakeWebSocket.instances).toHaveLength(2);
    expect(reads.orders).toBe(before.orders + 1);
    expect(reads.stock).toBe(before.stock + 1);
  });

  it("reads once on returning to a tab that was hidden a while", async () => {
    mount();
    await goLive();
    const before = reads.orders;

    await act(async () => {
      setVisibility("hidden");
      await vi.advanceTimersByTimeAsync(60_000);
      setVisibility("visible");
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(reads.orders).toBeGreaterThan(before);
  });

  it("closes the connection after five minutes hidden and reconnects on return", async () => {
    mount();
    const first = await goLive();

    await act(async () => {
      setVisibility("hidden");
      await vi.advanceTimersByTimeAsync(5 * 60_000);
    });
    expect(first.closed).toBe(true);

    const before = reads.orders;
    await act(async () => {
      setVisibility("visible");
      await vi.advanceTimersByTimeAsync(0);
    });
    await goLive();
    expect(FakeWebSocket.instances).toHaveLength(2);
    expect(reads.orders).toBe(before + 1);
  });

  it("closes the connection on sign-out", async () => {
    const view = mount();
    const socket = await goLive();
    await act(async () => {
      view.setEnabled(false);
    });
    expect(socket.closed).toBe(true);
  });

  // FR-016
  it("does not disturb what the person is typing", async () => {
    mount();
    const socket = await goLive();
    const input = screen.getByLabelText("note") as HTMLInputElement;
    input.focus();
    input.value = "left at the back door";

    await act(async () => {
      socket.receive({ type: "data", id: socket.subscriptionId(), event: ['{"k":"orders"}'] });
      await vi.advanceTimersByTimeAsync(2_000);
    });

    expect(input.value).toBe("left at the back door");
    expect(document.activeElement).toBe(input);
  });
});

describe("LiveStatus (FR-015)", () => {
  it("shows nothing while live", async () => {
    mount();
    await goLive();
    await act(() => vi.advanceTimersByTimeAsync(10_000));
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("does not flash for a brief reconnect", async () => {
    mount();
    const first = await goLive();
    await act(async () => {
      first.onclose?.();
      await vi.advanceTimersByTimeAsync(1_000);
    });
    expect(screen.queryByRole("status")).toBeNull();
    await goLive();
    await act(() => vi.advanceTimersByTimeAsync(10_000));
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("says it is reconnecting, how old the screen is, and offers a refresh", async () => {
    mount();
    const first = await goLive();
    const before = reads.orders;
    await act(async () => {
      first.onclose?.();
      await vi.advanceTimersByTimeAsync(0);
    });
    await act(() => vi.advanceTimersByTimeAsync(4_000));

    const status = screen.getByRole("status");
    expect(status.textContent).toMatch(/Reconnecting · last updated \d/);

    await act(async () => {
      screen.getByRole("button", { name: "Refresh now" }).click();
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(reads.orders).toBeGreaterThan(before);
  });

  it("says live updates are off when there is no channel", async () => {
    mount({ loadDescriptor: async () => null });
    await flush();
    await act(() => vi.advanceTimersByTimeAsync(4_000));
    expect(screen.getByRole("status").textContent).toMatch(/Live updates off · last updated \d/);
    expect(FakeWebSocket.instances).toHaveLength(0);
  });
});
