import { parseChannel, subscribableEpochs, type LiveNamespace, OPS_SCOPE_ID } from "@effy/edge-shared/live";

/**
 * 071 — may this person open the live channel, and may they hear this channel?
 *
 * The decision, with no I/O of its own: verifying the token and reading the platform record are
 * handed in, so every refusal below is a unit test.
 *
 * ⚠ THE DEFAULT IS REFUSAL. Every path that is not an explicit `allow` refuses — an unknown
 * operation, an unreadable channel, a missing record, an exception. An authorizer that fails open
 * is a channel anyone can listen to.
 */

export type Audience = "customer" | "shop" | "driver" | "back-office";

/** The namespace each audience may subscribe in — and the only one (FR-022). */
export const NAMESPACE_OF: Readonly<Record<Audience, LiveNamespace>> = {
  customer: "customer",
  shop: "shop",
  driver: "driver",
  "back-office": "ops",
};

export interface VerifiedToken {
  audience: Audience;
  sub: string;
}

export interface AuthorizeRequest {
  operation: string;
  /** The raw authorization value the app sent. */
  token: string;
  /** `null` on connect. */
  channel: string | null;
}

export interface AuthorizeDeps {
  /** `null` for a token that does not verify against any of the four pools. */
  verify(token: string): Promise<VerifiedToken | null>;
  shopScope(sub: string): Promise<string | null>;
  driverScope(sub: string): Promise<string | null>;
  opsScope(sub: string): Promise<boolean>;
  now(): number;
}

export type Outcome =
  | "allowed"
  | "bad_token"
  | "bad_channel"
  | "wrong_audience"
  | "stale_epoch"
  | "wrong_scope"
  | "no_record"
  | "publish_refused"
  | "unknown_operation";

export interface Decision {
  isAuthorized: boolean;
  outcome: Outcome;
  /** Present when a token verified — for the log line. */
  audience?: Audience;
}

const refuse = (outcome: Outcome, audience?: Audience): Decision => ({ isAuthorized: false, outcome, audience });
const allow = (audience: Audience): Decision => ({ isAuthorized: true, outcome: "allowed", audience });

/** The scope this person may hear, read from the platform record; `null` when they have none. */
async function entitledScope(token: VerifiedToken, deps: AuthorizeDeps): Promise<string | null> {
  switch (token.audience) {
    case "customer":
      // Their own token subject. No record is read: a customer's access to their own orders is
      // decided at every read by the commerce service, and shopper traffic must not reach the
      // database through this function.
      return token.sub;
    case "shop":
      return deps.shopScope(token.sub);
    case "driver":
      return deps.driverScope(token.sub);
    case "back-office":
      return (await deps.opsScope(token.sub)) ? OPS_SCOPE_ID : null;
  }
}

export async function authorize(req: AuthorizeRequest, deps: AuthorizeDeps): Promise<Decision> {
  // Clients never publish. Publishing is by the backend's own role, which does not come through
  // this function at all — so anything asking to publish here is refused before its token is read.
  if (req.operation === "EVENT_PUBLISH") return refuse("publish_refused");
  if (req.operation !== "EVENT_CONNECT" && req.operation !== "EVENT_SUBSCRIBE") {
    return refuse("unknown_operation");
  }

  const token = await deps.verify(req.token);
  if (!token) return refuse("bad_token");

  if (req.operation === "EVENT_CONNECT") return allow(token.audience);

  const channel = req.channel === null ? null : parseChannel(req.channel);
  if (!channel) return refuse("bad_channel", token.audience);
  if (channel.namespace !== NAMESPACE_OF[token.audience]) return refuse("wrong_audience", token.audience);
  if (!subscribableEpochs(deps.now()).includes(channel.epoch)) return refuse("stale_epoch", token.audience);

  const scope = await entitledScope(token, deps);
  if (scope === null) return refuse("no_record", token.audience);
  if (scope !== channel.scopeId) return refuse("wrong_scope", token.audience);

  return allow(token.audience);
}
