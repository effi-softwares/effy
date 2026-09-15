/**
 * A Server-Sent Events reader for authenticated streams (058).
 *
 * ⚠ WHY NOT `EventSource`. The browser's own SSE client cannot send headers — the WHATWG constructor
 * takes a URL and `withCredentials`, nothing else — so a bearer token could only travel in the query
 * string, where it lands in every access log, proxy log and browser history entry along the way. A
 * token in a URL is a token you have to rotate. So the stream is read with `fetch` + a
 * `ReadableStream`, which can carry an `Authorization` header like every other call this app makes.
 *
 * ⚠ WHAT WE GIVE UP BY NOT USING `EventSource`, and why it costs nothing here: automatic reconnect
 * (reimplemented below, with jitter the browser does not give you) and `Last-Event-ID` resumption
 * (deliberately unused — this stream's events are content-free hints, and resuming would mean
 * trusting a channel that is explicitly not durable; on reconnect the caller refetches instead).
 *
 * ⚠ NO DEPENDENCY. The format is four line types and a blank-line frame terminator. A library for
 * this is a supply-chain surface and a maintenance bet for ~60 lines of parsing.
 */

export interface LiveEvent {
  /** The `event:` field, or "message" when the server omitted one. */
  event: string
  /** The `data:` field, joined across continuation lines. Always `{}` on this platform's streams. */
  data: string
}

export interface LiveStreamOptions {
  url: string
  /** Resolved per CONNECTION, not once — a reconnect an hour later needs a fresh token. */
  getToken: () => Promise<string | null | undefined>
  onEvent: (e: LiveEvent) => void
  /** Called when a connection is established, and again on each reconnect. */
  onOpen?: () => void
  /** Called when a connection ends for any reason. */
  onClose?: (reason: "error" | "ended" | "aborted") => void
  /** Injected in tests. */
  fetchImpl?: typeof fetch
  /**
   * No bytes for this long — not even a heartbeat comment — means the connection is dead in a way
   * TCP has not noticed yet (a sleeping laptop's socket, a silently dropped NAT mapping). The server
   * beats every 20 s, so 45 s tolerates one missed beat before giving up.
   */
  stallMs?: number
  /** First backoff step; doubles to `maxBackoffMs`, with jitter. */
  backoffMs?: number
  maxBackoffMs?: number
}

const DEFAULT_STALL_MS = 45_000
const DEFAULT_BACKOFF_MS = 1_000
const DEFAULT_MAX_BACKOFF_MS = 30_000

/**
 * Open a stream and keep it open until `stop()` is called.
 *
 * ⚠ THE RETURNED FUNCTION MUST BE CALLED ON UNMOUNT (FR-029). It aborts the in-flight request, drops
 * the reader and clears every timer; without it a console tab that moves between screens all shift
 * accumulates readers and reconnect timers that nothing will ever collect.
 */
export function openLiveStream(opts: LiveStreamOptions): () => void {
  const fetchImpl = opts.fetchImpl ?? globalThis.fetch.bind(globalThis)
  const stallMs = opts.stallMs ?? DEFAULT_STALL_MS
  const maxBackoff = opts.maxBackoffMs ?? DEFAULT_MAX_BACKOFF_MS

  let stopped = false
  let controller: AbortController | null = null
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null
  let stallTimer: ReturnType<typeof setTimeout> | null = null
  let backoff = opts.backoffMs ?? DEFAULT_BACKOFF_MS

  const clearStall = () => {
    if (stallTimer !== null) {
      clearTimeout(stallTimer)
      stallTimer = null
    }
  }

  const armStall = () => {
    clearStall()
    stallTimer = setTimeout(() => {
      // Nothing has arrived for too long: treat it as a dead connection and reconnect.
      controller?.abort()
    }, stallMs)
  }

  const scheduleReconnect = () => {
    if (stopped) return
    const jitter = Math.random() * backoff * 0.5
    reconnectTimer = setTimeout(() => {
      void connect()
    }, backoff + jitter)
    backoff = Math.min(backoff * 2, maxBackoff)
  }

  async function connect(): Promise<void> {
    if (stopped) return
    controller = new AbortController()

    try {
      const token = await opts.getToken()
      const res = await fetchImpl(opts.url, {
        method: "GET",
        headers: {
          accept: "text/event-stream",
          ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
        signal: controller.signal,
        // Never let a cache sit between a live stream and its reader.
        cache: "no-store",
      })

      if (!res.ok || !res.body) {
        opts.onClose?.("error")
        scheduleReconnect()
        return
      }

      // A successful connection resets the backoff: the next failure should retry quickly, not
      // inherit the delay from an outage that is over.
      backoff = opts.backoffMs ?? DEFAULT_BACKOFF_MS
      opts.onOpen?.()
      armStall()

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ""

      for (;;) {
        const { value, done } = await reader.read()
        if (done) break
        armStall()
        buffer += decoder.decode(value, { stream: true })

        // Frames are separated by a blank line. Keep the trailing partial in the buffer.
        let sep = buffer.indexOf("\n\n")
        while (sep !== -1) {
          const frame = buffer.slice(0, sep)
          buffer = buffer.slice(sep + 2)
          const parsed = parseFrame(frame)
          if (parsed) opts.onEvent(parsed)
          sep = buffer.indexOf("\n\n")
        }
      }

      clearStall()
      opts.onClose?.("ended")
      scheduleReconnect()
    } catch {
      clearStall()
      if (stopped) {
        opts.onClose?.("aborted")
        return
      }
      opts.onClose?.("error")
      scheduleReconnect()
    }
  }

  void connect()

  return () => {
    stopped = true
    clearStall()
    if (reconnectTimer !== null) clearTimeout(reconnectTimer)
    controller?.abort()
  }
}

/**
 * Parse one frame into an event.
 *
 * Comment lines (`: hb`) carry no event — they exist to keep the socket warm — and `id:` is read and
 * discarded: this platform never resumes from it (see the header).
 */
export function parseFrame(frame: string): LiveEvent | null {
  let event = "message"
  const data: string[] = []
  let sawField = false

  for (const rawLine of frame.split("\n")) {
    const line = rawLine.endsWith("\r") ? rawLine.slice(0, -1) : rawLine
    if (line === "" || line.startsWith(":")) continue
    const colon = line.indexOf(":")
    const field = colon === -1 ? line : line.slice(0, colon)
    // "Optional single space after the colon" — the spec's rule, not a guess.
    let value = colon === -1 ? "" : line.slice(colon + 1)
    if (value.startsWith(" ")) value = value.slice(1)

    if (field === "event") {
      event = value
      sawField = true
    } else if (field === "data") {
      data.push(value)
      sawField = true
    } else if (field === "id" || field === "retry") {
      sawField = true
    }
  }

  if (!sawField) return null
  return { event, data: data.join("\n") }
}
