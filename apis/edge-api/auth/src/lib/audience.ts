/**
 * `userPoolId` → audience (research R8).
 *
 * One deployment serves all four pools, so per-audience differences are a branch rather than four
 * copies of the service. `event.userPoolId` is in the common trigger parameters, which is what
 * makes this possible at all.
 *
 * ⚠ FAIL CLOSED ON AN UNKNOWN POOL. If a pool id does not resolve, something has been wired that
 * this code was never reviewed against — the safe answer is to refuse, not to guess a default and
 * start emailing codes on behalf of an audience nobody signed off.
 */

export type Audience = "customer" | "driver" | "shop" | "back-office";

export interface AudienceProfile {
  readonly audience: Audience;
  /** Appears in the subject line. Internal staff and shoppers are addressed differently. */
  readonly productName: string;
  /** Internal audiences are employees on provisioned accounts; customers are the public. */
  readonly internal: boolean;
}

const PROFILES: Record<Audience, AudienceProfile> = {
  customer: { audience: "customer", productName: "Effy", internal: false },
  driver: { audience: "driver", productName: "Effy Driver", internal: true },
  shop: { audience: "shop", productName: "Effy Shop", internal: true },
  "back-office": { audience: "back-office", productName: "Effy Back-Office", internal: true },
};

/**
 * Built once per container from the env, so a warm invocation does no work here.
 * The four ids are injected by Terraform via SSM — see `serverless.yml`.
 */
function buildIndex(): ReadonlyMap<string, AudienceProfile> {
  const index = new Map<string, AudienceProfile>();
  const pairs: ReadonlyArray<readonly [string | undefined, Audience]> = [
    [process.env.CUSTOMER_USER_POOL_ID, "customer"],
    [process.env.DRIVER_USER_POOL_ID, "driver"],
    [process.env.SHOP_USER_POOL_ID, "shop"],
    [process.env.BACK_OFFICE_USER_POOL_ID, "back-office"],
  ];
  for (const [poolId, audience] of pairs) {
    if (poolId) index.set(poolId, PROFILES[audience]);
  }
  return index;
}

let index: ReadonlyMap<string, AudienceProfile> | undefined;

/** `null` when the pool is not one of ours — callers must treat that as a refusal. */
export function audienceForPool(userPoolId: string): AudienceProfile | null {
  index ??= buildIndex();
  return index.get(userPoolId) ?? null;
}

/** Test seam — the env is read once per container, so a test must be able to reset it. */
export function resetAudienceIndexForTests(): void {
  index = undefined;
}
