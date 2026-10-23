import { parseChannel, subscribableEpochs, type LiveNamespace, OPS_SCOPE_ID } from "@effy/edge-shared/live";

/**
 * Whether this person may connect to the live channel and hear a channel. No I/O: verification and
 * the record read are handed in. Anything that is not an explicit `allow` refuses.
 */

export type Audience = "customer" | "shop" | "driver" | "back-office";

/** The only namespace each audience may subscribe in. */
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
  token: string;
  /** `null` on connect. */
  channel: string | null;
}

export interface AuthorizeDeps {
  /** `null` when the token verifies against none of the four pools. */
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
  audience?: Audience;
}

const refuse = (outcome: Outcome, audience?: Audience): Decision => ({ isAuthorized: false, outcome, audience });
const allow = (audience: Audience): Decision => ({ isAuthorized: true, outcome: "allowed", audience });

/** `null` when they have no scope. */
async function entitledScope(token: VerifiedToken, deps: AuthorizeDeps): Promise<string | null> {
  switch (token.audience) {
    case "customer":
      // No record read: commerce decides a customer's access at every read, and shopper traffic must
      // not reach the database here.
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
  // Clients never publish; the backend publishes by its own role, so this refuses before reading the token.
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
