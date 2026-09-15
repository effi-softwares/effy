import { describe, expect, it, vi } from "vitest";

import { openLiveStream, parseFrame } from "./live";

/**
 * A ReadableStream that emits the given chunks, then (optionally) stays open.
 *
 * ⚠ IT HONOURS THE ABORT SIGNAL, because real `fetch` does: aborting the controller errors the body
 * stream and the pending `read()` rejects. A fake that ignored the signal would let the stall timer
 * "pass" while proving nothing about the only thing that recovers a silently dead socket.
 */
function streamOf(
  chunks: string[],
  { keepOpen = false, signal }: { keepOpen?: boolean; signal?: AbortSignal } = {},
): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const c of chunks) controller.enqueue(enc.encode(c));
      if (!keepOpen) {
        controller.close();
        return;
      }
      signal?.addEventListener("abort", () => {
        try {
          controller.error(new DOMException("aborted", "AbortError"));
        } catch {
          /* already closed */
        }
      });
    },
  });
}

function response(body: ReadableStream<Uint8Array>, ok = true): Response {
  return { ok, body, status: ok ? 200 : 503 } as unknown as Response;
}

describe("parseFrame", () => {
  it("reads the event and data fields", () => {
    expect(parseFrame("event: poke\nid: 12\ndata: {}")).toEqual({ event: "poke", data: "{}" });
  });

  it("defaults to `message` when the server names no event", () => {
    expect(parseFrame("data: hello")).toEqual({ event: "message", data: "hello" });
  });

  it("joins multi-line data, as the format requires", () => {
    expect(parseFrame("data: one\ndata: two")).toEqual({ event: "message", data: "one\ntwo" });
  });

  it("⚠ ignores comment lines — the heartbeat must not look like an event", () => {
    // The server beats every 20s with `: hb`. If that parsed as an event, every open console would
    // refetch three times a minute forever, which is the polling cost this design exists to avoid.
    expect(parseFrame(": hb")).toBeNull();
  });

  it("tolerates CRLF and a missing space after the colon", () => {
    expect(parseFrame("event:poke\r\ndata:{}\r")).toEqual({ event: "poke", data: "{}" });
  });
});

describe("openLiveStream", () => {
  it("sends the bearer token as a header, never in the URL", async () => {
    const fetchImpl = vi.fn(async (_url: unknown, _init?: RequestInit) =>
      response(streamOf(["event: poke\ndata: {}\n\n"])),
    );
    const events: string[] = [];

    const stop = openLiveStream({
      url: "https://core.example/v1/shop/live",
      getToken: async () => "tok-123",
      onEvent: (e) => events.push(e.event),
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await vi.waitFor(() => expect(events).toEqual(["poke"]));
    stop();

    const [url, init] = fetchImpl.mock.calls[0]!;
    // ⚠ A token in a query string lands in access logs, proxy logs and browser history. This is the
    // whole reason the stream is read with fetch instead of EventSource.
    expect(String(url)).not.toContain("tok-123");
    expect(init?.headers).toMatchObject({ authorization: "Bearer tok-123" });
  });

  it("delivers frames as they arrive, across chunk boundaries", async () => {
    // A frame split mid-field is the normal case on a real socket, not an edge case.
    const fetchImpl = vi.fn(async (_url: unknown, _init?: RequestInit) =>
      response(streamOf(["event: po", "ke\ndata: {}\n\nevent: resync\ndata: {}\n\n"])),
    );
    const events: string[] = [];

    const stop = openLiveStream({
      url: "u",
      getToken: async () => "t",
      onEvent: (e) => events.push(e.event),
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await vi.waitFor(() => expect(events).toEqual(["poke", "resync"]));
    stop();
  });

  it("resolves a FRESH token on every connection", async () => {
    let issued = 0;
    const fetchImpl = vi.fn(async (_url: unknown, _init?: RequestInit) => response(streamOf([])));
    const stop = openLiveStream({
      url: "u",
      getToken: async () => `tok-${++issued}`,
      onEvent: () => {},
      fetchImpl: fetchImpl as unknown as typeof fetch,
      backoffMs: 1,
    });

    // A stream reconnects for hours; a token captured once would expire and every reconnect after
    // that would 401 in a loop.
    await vi.waitFor(() => expect(fetchImpl.mock.calls.length).toBeGreaterThan(1));
    stop();
    const second = fetchImpl.mock.calls[1]![1];
    expect(second?.headers).toMatchObject({ authorization: "Bearer tok-2" });
  });

  it("reconnects after the stream ends", async () => {
    const fetchImpl = vi.fn(async (_url: unknown, _init?: RequestInit) =>
      response(streamOf(["event: poke\ndata: {}\n\n"])),
    );
    const closes: string[] = [];

    const stop = openLiveStream({
      url: "u",
      getToken: async () => "t",
      onEvent: () => {},
      onClose: (r) => closes.push(r),
      fetchImpl: fetchImpl as unknown as typeof fetch,
      backoffMs: 1,
    });
    await vi.waitFor(() => expect(fetchImpl.mock.calls.length).toBeGreaterThan(1));
    stop();
    expect(closes[0]).toBe("ended");
  });

  it("retries when the server refuses the connection", async () => {
    const fetchImpl = vi.fn(async (_url: unknown, _init?: RequestInit) => response(streamOf([]), false));
    const stop = openLiveStream({
      url: "u",
      getToken: async () => "t",
      onEvent: () => {},
      fetchImpl: fetchImpl as unknown as typeof fetch,
      backoffMs: 1,
    });
    // A 503 means "no listener right now"; the console keeps polling meanwhile and the stream
    // re-establishes itself when the service recovers.
    await vi.waitFor(() => expect(fetchImpl.mock.calls.length).toBeGreaterThan(1));
    stop();
  });

  it("aborts a silent connection once the stall timer expires", async () => {
    const fetchImpl = vi.fn(async (_url: unknown, init?: RequestInit) =>
      response(streamOf(["event: poke\ndata: {}\n\n"], { keepOpen: true, signal: init?.signal ?? undefined })),
    );
    const closes: string[] = [];

    const stop = openLiveStream({
      url: "u",
      getToken: async () => "t",
      onEvent: () => {},
      onClose: (r) => closes.push(r),
      fetchImpl: fetchImpl as unknown as typeof fetch,
      stallMs: 5,
      backoffMs: 1,
    });

    // ⚠ A socket can die without either end noticing — a sleeping laptop, a dropped NAT mapping. The
    // heartbeat is what makes silence detectable, and this is what acts on it.
    await vi.waitFor(() => expect(closes.length).toBeGreaterThan(0));
    stop();
  });

  it("⚠ stops everything on unmount: no reader, no reconnect, no timer (FR-029)", async () => {
    const fetchImpl = vi.fn(async (_url: unknown, init?: RequestInit) =>
      response(streamOf([], { keepOpen: true, signal: init?.signal ?? undefined })),
    );
    const stop = openLiveStream({
      url: "u",
      getToken: async () => "t",
      onEvent: () => {},
      fetchImpl: fetchImpl as unknown as typeof fetch,
      backoffMs: 1,
    });

    await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalled());
    stop();
    const callsAtStop = fetchImpl.mock.calls.length;

    await new Promise((r) => setTimeout(r, 40));
    // A console tab lives for a whole shift and moves between screens all day. A reader per visit,
    // never released, is a leak that shows up hours later as a warm laptop.
    expect(fetchImpl.mock.calls.length).toBe(callsAtStop);
  });
});
