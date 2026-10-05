// 071 — a bare client for the live channel, for the verification scripts. Deliberately NOT the
// apps' client: these scripts ask the channel questions an app never would (another shop's
// channel, a wildcard, a publish), so they speak the protocol directly.
import { call } from "./lib";

export interface LiveDescriptor {
  httpHost: string;
  realtimeHost: string;
  channelPrefix: string;
  epochSeconds: number;
  serverTime: string;
}

/** `GET /{audience}/v1/live` with an access token. `null` unless it answered 200. */
export async function describe(audiencePath: "shop" | "customer" | "driver" | "admin", token: string): Promise<{ status: number; descriptor: LiveDescriptor | null }> {
  const res = await call("GET", `/${audiencePath}/v1/live`, { token });
  return { status: res.status, descriptor: res.status === 200 ? (res.body as unknown as LiveDescriptor) : null };
}

export const currentEpoch = (d: LiveDescriptor) => Math.floor(Date.parse(d.serverTime) / 1000 / d.epochSeconds);

const b64url = (v: object) => Buffer.from(JSON.stringify(v)).toString("base64url");

export interface LiveConnection {
  /** Resolves "ok" on subscribe_success, or the error type the channel answered with. */
  subscribe(channel: string): Promise<string>;
  /** Resolves "ok" on publish_success, or the error type. */
  publish(channel: string): Promise<string>;
  onUpdate(listener: (at: number, kind: string) => void): void;
  close(): void;
}

/** Open a connection. Rejects if the channel refuses the handshake. */
export function connect(d: LiveDescriptor, token: string, timeoutMs = 10_000): Promise<LiveConnection> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`wss://${d.realtimeHost}/event/realtime`, [
      "aws-appsync-event-ws",
      `header-${b64url({ host: d.httpHost, Authorization: token })}`,
    ]);
    const waiting = new Map<string, (outcome: string) => void>();
    const listeners: Array<(at: number, kind: string) => void> = [];
    let n = 0;
    const timer = setTimeout(() => reject(new Error("live: handshake timed out")), timeoutMs);

    const ask = (type: "subscribe" | "publish", channel: string) =>
      new Promise<string>((done) => {
        const id = `v${++n}`;
        waiting.set(id, done);
        const authorization = { Authorization: token, host: d.httpHost };
        ws.send(JSON.stringify(type === "subscribe" ? { type, id, channel, authorization } : { type, id, channel, events: ['{"k":"orders"}'], authorization }));
        setTimeout(() => {
          if (waiting.delete(id)) done("no_answer");
        }, timeoutMs);
      });

    ws.onopen = () => ws.send(JSON.stringify({ type: "connection_init" }));
    ws.onerror = () => {
      clearTimeout(timer);
      reject(new Error("live: connection refused"));
    };
    ws.onmessage = (event) => {
      const at = performance.now();
      const m = JSON.parse(String(event.data)) as { type: string; id?: string; event?: unknown; errors?: { errorType?: string }[] };
      if (m.type === "connection_ack") {
        clearTimeout(timer);
        resolve({
          subscribe: (channel) => ask("subscribe", channel),
          publish: (channel) => ask("publish", channel),
          onUpdate: (listener) => void listeners.push(listener),
          close: () => ws.close(),
        });
      } else if (m.type === "connection_error") {
        clearTimeout(timer);
        reject(new Error(`live: ${m.errors?.[0]?.errorType ?? "connection_error"}`));
      } else if (m.type === "subscribe_success" || m.type === "publish_success") {
        waiting.get(m.id ?? "")?.("ok");
        waiting.delete(m.id ?? "");
      } else if (m.type === "subscribe_error" || m.type === "publish_error") {
        waiting.get(m.id ?? "")?.(m.errors?.[0]?.errorType ?? "error");
        waiting.delete(m.id ?? "");
      } else if (m.type === "data") {
        for (const raw of Array.isArray(m.event) ? m.event : [m.event]) {
          try {
            const k = (JSON.parse(String(raw)) as { k?: unknown }).k;
            for (const l of listeners) l(at, String(k));
          } catch {
            for (const l of listeners) l(at, "<not json>");
          }
        }
      }
    };
  });
}
