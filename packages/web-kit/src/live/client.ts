import { parseLiveUpdate, type LiveDescriptor, type LiveKind } from "@effy/shared-types";

/**
 * 071 — the live-update client: one socket, one subscription, and the rules for when to read.
 *
 * It carries no data. It tells its owner two things — "this kind of thing changed" and "you may
 * have missed something, read everything once" — and what state the channel is in. The owner
 * re-reads through the routes it already uses.
 *
 * ⚠ THERE IS NO DATA TIMER HERE (FR-009). The timers below keep a connection alive, back off a
 * reconnect, and move the subscription to the next ten-minute channel; none of them reads
 * anything, and an idle connected screen makes no request to the gateway (FR-012).
 *
 * ⚠ WHY THE SUBSCRIPTION MOVES. The channel authorizes a subscription once and never looks again,
 * so the channel name carries a ten-minute epoch and every app must subscribe afresh — and be
 * checked afresh — each epoch. That is what stops updates reaching a person whose access has ended
 * (FR-023). A refused subscription is therefore not an error to retry: it is the answer.
 */

export type LiveState = "live" | "reconnecting" | "off";

/** The part of a `WebSocket` this uses — so a test can stand in for it. */
export interface LiveSocket {
  send(data: string): void;
  close(): void;
  onopen: (() => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  onclose: (() => void) | null;
  onerror: (() => void) | null;
}

export interface LiveClientOptions {
  /**
   * Where this person's channel is. `null` when there is none for them — no live channel in this
   * environment, or no active record. Throwing means "could not find out": it is retried.
   */
  loadDescriptor(): Promise<LiveDescriptor | null>;
  /** The token the app sends to the API. `null` when signed out. */
  getToken(): Promise<string | null>;
  onUpdate(kind: LiveKind): void;
  /** The channel has (re)connected: anything may have changed while it was away. */
  onCaughtUp(): void;
  onState(state: LiveState): void;
  createSocket?: (url: string, protocols: string[]) => LiveSocket;
  random?: () => number;
}

export interface LiveClient {
  /** Connect, or reconnect if the channel is off. Does nothing when already connecting or live. */
  start(): void;
  /** Close the connection and stay closed until `start()`. */
  stop(): void;
  /** Try again now rather than waiting out a backoff — the network just came back. */
  retryNow(): void;
  state(): LiveState;
}

const SUBPROTOCOL = "aws-appsync-event-ws";
const BACKOFF_BASE_MS = 1_000;
const BACKOFF_MAX_MS = 60_000;
/** How long before an epoch begins this subscribes to it, and how long after it keeps the old one. */
const EPOCH_MARGIN_MS = 60_000;
/** Used until the channel states its own keep-alive timeout. */
const DEFAULT_KEEPALIVE_TIMEOUT_MS = 300_000;

function base64Url(value: object): string {
  return btoa(JSON.stringify(value)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function createLiveClient(options: LiveClientOptions): LiveClient {
  const createSocket =
    options.createSocket ?? ((url, protocols) => new WebSocket(url, protocols) as unknown as LiveSocket);
  const random = options.random ?? Math.random;

  let state: LiveState = "off";
  /** Bumped on every connect and every stop, so work begun for an older connection can tell. */
  let generation = 0;
  let socket: LiveSocket | null = null;
  let attempts = 0;
  let caughtUp = false;
  let keepAliveTimeoutMs = DEFAULT_KEEPALIVE_TIMEOUT_MS;

  let descriptor: LiveDescriptor | null = null;
  /** Server clock minus this device's, so a wrong device clock cannot pick the wrong epoch. */
  let clockOffsetMs = 0;
  /** epoch → subscription id, for the one or two channels subscribed to right now. */
  const subscriptions = new Map<number, string>();
  let nextSubscriptionId = 0;

  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  let keepAliveTimer: ReturnType<typeof setTimeout> | undefined;
  let rollTimer: ReturnType<typeof setTimeout> | undefined;
  let dropTimer: ReturnType<typeof setTimeout> | undefined;

  function setState(next: LiveState): void {
    if (state === next) return;
    state = next;
    options.onState(next);
  }

  function clearTimers(): void {
    clearTimeout(retryTimer);
    clearTimeout(keepAliveTimer);
    clearTimeout(rollTimer);
    clearTimeout(dropTimer);
    retryTimer = keepAliveTimer = rollTimer = dropTimer = undefined;
  }

  function closeSocket(): void {
    const s = socket;
    socket = null;
    subscriptions.clear();
    if (!s) return;
    s.onopen = s.onmessage = s.onclose = s.onerror = null;
    try {
      s.close();
    } catch {
      // already closed
    }
  }

  /** Stop for good: signed out, refused, or no channel. Only `start()` leaves this. */
  function turnOff(): void {
    generation++;
    clearTimers();
    closeSocket();
    setState("off");
  }

  function scheduleReconnect(): void {
    clearTimers();
    closeSocket();
    setState("reconnecting");
    const ceiling = Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * 2 ** attempts);
    attempts++;
    // Jittered: a hundred tablets that lost the same network must not all return in the same second.
    const delay = ceiling * (0.5 + random() * 0.5);
    const mine = generation;
    retryTimer = setTimeout(() => {
      if (mine === generation) void connect();
    }, delay);
  }

  function serverNowMs(): number {
    return Date.now() + clockOffsetMs;
  }

  function epochNow(d: LiveDescriptor): number {
    return Math.floor(serverNowMs() / 1000 / d.epochSeconds);
  }

  function armKeepAlive(): void {
    clearTimeout(keepAliveTimer);
    const mine = generation;
    // No keep-alive within the channel's own stated timeout: the connection is dead, however open
    // the socket claims to be.
    keepAliveTimer = setTimeout(() => {
      if (mine === generation) scheduleReconnect();
    }, keepAliveTimeoutMs);
  }

  async function subscribe(epoch: number): Promise<void> {
    const mine = generation;
    const d = descriptor;
    if (!d || subscriptions.has(epoch)) return;
    // A fresh token each time: the session refreshes it, and the access check must see who this is now.
    const token = await options.getToken();
    if (mine !== generation) return;
    if (!token) return turnOff();
    const id = `s${++nextSubscriptionId}`;
    subscriptions.set(epoch, id);
    socket?.send(
      JSON.stringify({
        type: "subscribe",
        id,
        channel: `${d.channelPrefix}/${epoch}`,
        authorization: { Authorization: token, host: d.httpHost },
      }),
    );
  }

  /** Subscribe to the next epoch a minute before it begins; drop this one a minute after. */
  function scheduleRoll(epoch: number): void {
    const d = descriptor;
    if (!d) return;
    const mine = generation;
    const boundaryMs = (epoch + 1) * d.epochSeconds * 1000;
    clearTimeout(rollTimer);
    rollTimer = setTimeout(() => {
      if (mine === generation) void subscribe(epoch + 1);
    }, Math.max(0, boundaryMs - EPOCH_MARGIN_MS - serverNowMs()));
  }

  function scheduleDrop(epoch: number): void {
    const d = descriptor;
    if (!d) return;
    const mine = generation;
    const boundaryMs = (epoch + 1) * d.epochSeconds * 1000;
    clearTimeout(dropTimer);
    dropTimer = setTimeout(() => {
      if (mine !== generation) return;
      const id = subscriptions.get(epoch);
      if (!id) return;
      subscriptions.delete(epoch);
      socket?.send(JSON.stringify({ type: "unsubscribe", id }));
    }, Math.max(0, boundaryMs + EPOCH_MARGIN_MS - serverNowMs()));
  }

  function epochOfSubscription(id: unknown): number | undefined {
    for (const [epoch, subId] of subscriptions) if (subId === id) return epoch;
    return undefined;
  }

  function onMessage(raw: unknown): void {
    if (typeof raw !== "string") return;
    let message: { type?: unknown; id?: unknown; event?: unknown; connectionTimeoutMs?: unknown };
    try {
      message = JSON.parse(raw) as typeof message;
    } catch {
      return;
    }
    if (typeof message !== "object" || message === null) return;

    switch (message.type) {
      case "connection_ack": {
        if (typeof message.connectionTimeoutMs === "number" && message.connectionTimeoutMs > 0) {
          keepAliveTimeoutMs = message.connectionTimeoutMs;
        }
        armKeepAlive();
        if (descriptor) void subscribe(epochNow(descriptor));
        return;
      }
      case "ka":
        armKeepAlive();
        return;
      case "subscribe_success": {
        const epoch = epochOfSubscription(message.id);
        if (epoch === undefined) return;
        attempts = 0;
        setState("live");
        if (!caughtUp) {
          // First subscription of this connection: whatever happened while it was away is unknown.
          caughtUp = true;
          options.onCaughtUp();
        } else {
          // The next epoch is in place; the one before it can go once the overlap has passed.
          scheduleDrop(epoch - 1);
        }
        scheduleRoll(epoch);
        return;
      }
      case "subscribe_error":
        // Refused: access has ended, or this person never had a channel. Not retried (see header).
        if (epochOfSubscription(message.id) !== undefined) turnOff();
        return;
      case "data": {
        if (epochOfSubscription(message.id) === undefined) return;
        const events = Array.isArray(message.event) ? message.event : [message.event];
        for (const event of events) {
          const kind = typeof event === "string" ? parseLiveUpdate(event) : null;
          if (kind) options.onUpdate(kind);
        }
        return;
      }
      case "connection_error":
      case "error":
        scheduleReconnect();
        return;
      default:
        // A message this build has never heard of. Ignored.
        return;
    }
  }

  async function connect(): Promise<void> {
    const mine = ++generation;
    clearTimers();
    closeSocket();
    caughtUp = false;
    setState("reconnecting");

    let token: string | null;
    let found: LiveDescriptor | null;
    try {
      token = await options.getToken();
      if (mine !== generation) return;
      if (!token) return turnOff();
      found = await options.loadDescriptor();
    } catch {
      if (mine === generation) scheduleReconnect();
      return;
    }
    if (mine !== generation) return;
    if (!found) return turnOff();

    descriptor = found;
    const serverTime = Date.parse(found.serverTime);
    clockOffsetMs = Number.isFinite(serverTime) ? serverTime - Date.now() : 0;

    let s: LiveSocket;
    try {
      s = createSocket(`wss://${found.realtimeHost}/event/realtime`, [
        SUBPROTOCOL,
        `header-${base64Url({ host: found.httpHost, Authorization: token })}`,
      ]);
    } catch {
      scheduleReconnect();
      return;
    }
    socket = s;
    s.onopen = () => {
      if (mine !== generation) return;
      s.send(JSON.stringify({ type: "connection_init" }));
      armKeepAlive();
    };
    s.onmessage = (event) => {
      if (mine === generation) onMessage(event.data);
    };
    const lost = () => {
      if (mine === generation) scheduleReconnect();
    };
    s.onclose = lost;
    s.onerror = lost;
  }

  return {
    start() {
      if (state !== "off") return;
      attempts = 0;
      void connect();
    },
    stop() {
      turnOff();
    },
    retryNow() {
      if (state !== "reconnecting") return;
      attempts = 0;
      void connect();
    },
    state: () => state,
  };
}
