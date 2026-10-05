import { CognitoJwtVerifier } from "aws-jwt-verify";

import type { Audience, VerifiedToken } from "./service";

/**
 * Verify a token against the pool its issuer names (constitution Principle IV: per-pool, issuer
 * pinned). The verifier checks signature, expiry, issuer and app client — the same four things the
 * gateway's JWT authorizers check, against the same pools and clients.
 *
 * `tokenUse: null` accepts an access token or an id token, as the gateway does: an app sends here
 * exactly what it sends there.
 */

const AUDIENCES: ReadonlyArray<{ audience: Audience; poolEnv: string; clientsEnv: string }> = [
  { audience: "customer", poolEnv: "CUSTOMER_USER_POOL_ID", clientsEnv: "CUSTOMER_CLIENT_IDS" },
  { audience: "shop", poolEnv: "SHOP_USER_POOL_ID", clientsEnv: "SHOP_CLIENT_IDS" },
  { audience: "driver", poolEnv: "DRIVER_USER_POOL_ID", clientsEnv: "DRIVER_CLIENT_IDS" },
  { audience: "back-office", poolEnv: "BACK_OFFICE_USER_POOL_ID", clientsEnv: "BACK_OFFICE_CLIENT_IDS" },
];

function requiredEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`live: required environment variable ${name} is not set`);
  return v;
}

interface Pools {
  verify(token: string): Promise<{ iss: string; sub: string }>;
  audienceOf: ReadonlyMap<string, Audience>;
}

let pools: Pools | undefined;

function getPools(): Pools {
  if (pools) return pools;
  const audienceOf = new Map<string, Audience>();
  const configs = AUDIENCES.map(({ audience, poolEnv, clientsEnv }) => {
    const userPoolId = requiredEnv(poolEnv);
    audienceOf.set(userPoolId, audience);
    return { userPoolId, tokenUse: null, clientId: requiredEnv(clientsEnv).split(",").filter(Boolean) };
  });
  const verifier = CognitoJwtVerifier.create(configs);
  pools = { verify: (token) => verifier.verify(token) as Promise<{ iss: string; sub: string }>, audienceOf };
  return pools;
}

/** A leading scheme is tolerated: some clients send `Bearer <token>`, as they do to the gateway. */
export function bareToken(raw: string): string {
  return raw.replace(/^Bearer\s+/i, "").trim();
}

export async function verifyToken(raw: string): Promise<VerifiedToken | null> {
  const p = getPools();
  let payload: { iss: string; sub: string };
  try {
    payload = await p.verify(bareToken(raw));
  } catch {
    // Expired, forged, from another issuer, for another app client — all one answer.
    return null;
  }
  // The issuer ends in the pool id; the verifier has already proved the issuer is one of ours.
  const poolId = payload.iss.slice(payload.iss.lastIndexOf("/") + 1);
  const audience = p.audienceOf.get(poolId);
  if (!audience || typeof payload.sub !== "string" || payload.sub.length === 0) return null;
  return { audience, sub: payload.sub };
}
