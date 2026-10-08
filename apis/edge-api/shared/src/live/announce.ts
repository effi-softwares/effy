import { logger } from "../lib/logger";
import { emitMetric } from "../lib/metrics";
import { channelPrefix, OPS_SCOPE_ID, publishEpochs } from "./channel";
import { signPublish } from "./sign";

/**
 * 071 — tell open apps that something they are showing has changed.
 *
 * ⚠ CALL THIS AFTER THE TRANSACTION HAS COMMITTED, from the service layer, never inside it. An
 * update for a change that then rolls back sends every open screen to re-read a state that never
 * happened (FR-004).
 *
 * ⚠ THIS NEVER THROWS AND NEVER REJECTS (FR-006). A payment, a pick, a refund or an assignment
 * has already succeeded by the time this runs; the live channel being down must not turn that into
 * a failure reported to the person who did it. A lost update is a stale screen until the next
 * update or the app's next catch-up read — never a wrong one, because an update carries no data.
 *
 * ⚠ AWAIT IT. A function is frozen the moment its handler returns; an un-awaited publish is
 * usually a publish that never left.
 */

/**
 * A change, named by whose it is and what kind of thing. There is deliberately no field for an
 * order id, a status or an amount (FR-002) — and the customer variant has no field a shop id could
 * be put in (FR-024).
 */
export type LiveChange =
  | { scope: "shop"; shopId: string; kind: "orders" | "stock" | "attention" }
  | { scope: "customer"; sub: string; kind: "orders" | "points" }
  | { scope: "driver"; driverId: string; kind: "work" }
  | { scope: "ops"; kind: "orders" | "dispatch" | "slots" | "review" | "points" | "coverage" };

/** The live channel's metric namespace — one for the platform, not one per service. */
export const LIVE_METRIC_NAMESPACE = "Effy/Live";

const ATTEMPT_TIMEOUT_MS = 1_500;
const ATTEMPTS = 2;
/** The service accepts at most five events in one publish. */
const MAX_EVENTS_PER_PUBLISH = 5;

type Fetch = typeof fetch;

export interface AnnounceDeps {
  fetch?: Fetch;
  now?: () => number;
  env?: NodeJS.ProcessEnv;
}

function prefixOf(change: LiveChange): string {
  switch (change.scope) {
    case "shop":
      return channelPrefix("shop", change.shopId);
    case "customer":
      return channelPrefix("customer", change.sub);
    case "driver":
      return channelPrefix("driver", change.driverId);
    case "ops":
      return channelPrefix("ops", OPS_SCOPE_ID);
  }
}

/** Group by channel prefix, each with its distinct kinds — one change named twice publishes once. */
function group(changes: readonly LiveChange[]): Map<string, Set<string>> {
  const byPrefix = new Map<string, Set<string>>();
  for (const change of changes) {
    let prefix: string;
    try {
      prefix = prefixOf(change);
    } catch (err) {
      // An id that cannot be a channel segment. Skip it; the rest still go.
      logger.warn({ err, scope: change.scope }, "live: change skipped, scope id is not a valid segment");
      continue;
    }
    const kinds = byPrefix.get(prefix) ?? new Set<string>();
    kinds.add(change.kind);
    byPrefix.set(prefix, kinds);
  }
  return byPrefix;
}

async function publishOnce(
  host: string,
  region: string,
  channel: string,
  kinds: readonly string[],
  env: NodeJS.ProcessEnv,
  doFetch: Fetch,
): Promise<void> {
  const body = JSON.stringify({ channel, events: kinds.map((k) => JSON.stringify({ k })) });
  const signed = signPublish(host, body, region, {
    accessKeyId: env.AWS_ACCESS_KEY_ID ?? "",
    secretAccessKey: env.AWS_SECRET_ACCESS_KEY ?? "",
    sessionToken: env.AWS_SESSION_TOKEN,
  });
  const res = await doFetch(signed.url, {
    method: "POST",
    headers: signed.headers,
    body: signed.body,
    signal: AbortSignal.timeout(ATTEMPT_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`live: publish answered ${res.status}`);
}

async function publish(
  host: string,
  region: string,
  channel: string,
  kinds: readonly string[],
  env: NodeJS.ProcessEnv,
  doFetch: Fetch,
): Promise<boolean> {
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    try {
      await publishOnce(host, region, channel, kinds, env, doFetch);
      return true;
    } catch (err) {
      if (attempt === ATTEMPTS) {
        // The channel is deliberately not logged: its middle segment is whose update it was
        // (FR-034). The namespace is enough to see which audience is affected.
        logger.warn({ err, namespace: channel.split("/")[1], kinds }, "live: update not sent");
      }
    }
  }
  return false;
}

let saidUnconfigured = false;

export async function announce(changes: readonly LiveChange[], deps: AnnounceDeps = {}): Promise<void> {
  try {
    if (changes.length === 0) return;
    const env = deps.env ?? process.env;
    const host = env.LIVE_HTTP_HOST;
    const region = env.AWS_REGION;
    if (!host || !region) {
      // A local run, a test, or an environment where the channel has been removed. Not an error:
      // every app then reads on open, on return and on request, which is a supported state.
      if (!saidUnconfigured) {
        saidUnconfigured = true;
        logger.debug("live: no channel configured, updates are not sent");
      }
      return;
    }

    const doFetch = deps.fetch ?? fetch;
    const epochs = publishEpochs((deps.now ?? Date.now)());

    const sends: Promise<void>[] = [];
    for (const [prefix, kindSet] of group(changes)) {
      const kinds = [...kindSet].slice(0, MAX_EVENTS_PER_PUBLISH);
      for (const epoch of epochs) {
        sends.push(
          publish(host, region, `${prefix}/${epoch}`, kinds, env, doFetch).then((sent) => {
            for (const kind of kinds) {
              emitMetric(LIVE_METRIC_NAMESPACE, sent ? "UpdatesSent" : "UpdateSendFailures", 1, { kind });
            }
          }),
        );
      }
    }
    await Promise.all(sends);
  } catch (err) {
    // Belt and braces: nothing above should throw, and nothing may escape if it does.
    logger.warn({ err }, "live: announce failed");
  }
}
