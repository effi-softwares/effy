/** `userPoolId` → audience. One deployment serves four pools. An unknown pool fails closed. */

export type Audience = "customer" | "driver" | "shop" | "back-office";

export interface AudienceProfile {
  readonly audience: Audience;
  /** Appears in the subject line. */
  readonly productName: string;
  /** Internal audiences are employees; customers are the public. */
  readonly internal: boolean;
}

const PROFILES: Record<Audience, AudienceProfile> = {
  customer: { audience: "customer", productName: "Effy", internal: false },
  driver: { audience: "driver", productName: "Effy Driver", internal: true },
  shop: { audience: "shop", productName: "Effy Shop", internal: true },
  "back-office": { audience: "back-office", productName: "Effy Back-Office", internal: true },
};

/** Built once per container from env (SSM, via serverless.yml). */
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

/** `null` when the pool is not ours: callers must refuse. */
export function audienceForPool(userPoolId: string): AudienceProfile | null {
  index ??= buildIndex();
  return index.get(userPoolId) ?? null;
}

export function resetAudienceIndexForTests(): void {
  index = undefined;
}
