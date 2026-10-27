import { logger } from "../lib/logger";
import { emitMetric } from "../lib/metrics";
import { channelPrefix, OPS_SCOPE_ID, publishEpochs } from "./channel";
import { signPublish } from "./sign";

/**
 * Tells open apps that something they show has changed. Call it after the transaction commits, never
 * inside it, and await it (a frozen function never publishes). It never throws: the change already
 * succeeded, and a lost update only leaves a stale screen, never a wrong one.
 */

/** Whose change and what kind. No field for an id, status or amount; the customer variant has none for a shop id. */
export type LiveChange =
  | { scope: "shop"; shopId: string; kind: "orders" | "stock" | "attention" | "taxonomy" | "products" }
  | { scope: "customer"; sub: string; kind: "orders" | "points" }
  | { scope: "driver"; driverId: string; kind: "work" }
  | { scope: "ops"; kind: "orders" | "dispatch" | "slots" | "review" | "points" | "coverage" | "pricing" | "promotions" | "taxonomy" | "products" };

/** One namespace for the platform. */
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

/** Grouped by channel prefix with distinct kinds, so a change named twice publishes once. */
function group(changes: readonly LiveChange[]): Map<string, Set<string>> {
  const byPrefix = new Map<string, Set<string>>();
  for (const change of changes) {
    let prefix: string;
    try {
      prefix = prefixOf(change);
    } catch (err) {
      // Not a valid channel segment: skip it, the rest still go.
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
        // The channel is not logged: its middle segment says whose update it was.
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
      // No channel configured (local, test, removed): apps then read on open and on return.
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
    // Nothing above should throw, and nothing may escape if it does.
    logger.warn({ err }, "live: announce failed");
  }
}
