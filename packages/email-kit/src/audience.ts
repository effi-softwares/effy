/**
 * Audience → how a message addresses that person, and where a reply goes. The reply address is derived,
 * never passed in, so no send site can introduce a third address; both addresses come from the SSM
 * contract (`/effy/<env>/ses/*`).
 */

export type Audience = "customer" | "driver" | "shop" | "back-office";

export interface AudienceProfile {
  readonly audience: Audience;
  /** Appears in the subject, the wordmark and the footer. */
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

export function profileFor(audience: Audience): AudienceProfile {
  const p = PROFILES[audience];
  if (!p) {
    // Fail closed rather than send for an audience nobody reviewed.
    throw new Error(`email-kit: unknown audience '${String(audience)}'`);
  }
  return p;
}

export interface MailIdentity {
  /** `Effy <no-reply@…>` — from `/effy/<env>/ses/sender`. */
  readonly sender: string;
  /** Customer-facing reply address — from `/effy/<env>/ses/reply_to`. */
  readonly replyToPublic: string;
  /** Operational reply address — from `/effy/<env>/ses/reply_to_internal`. */
  readonly replyToInternal: string;
  /** Operator-supplied, from `/effy/<env>/mail/postal_address`. Never inferred. */
  readonly postalAddress: string;
}

/** Derived: internal audiences reply to the operational mailbox. */
export function replyAddressFor(profile: AudienceProfile, identity: MailIdentity): string {
  return profile.internal ? identity.replyToInternal : identity.replyToPublic;
}

/** The values every layout consumes, injected by the platform: a call site supplies none. */
export function platformVars(
  profile: AudienceProfile,
  identity: MailIdentity,
): Record<string, string> {
  return {
    effyProductName: profile.productName,
    effySupportEmail: replyAddressFor(profile, identity),
    effyPostalAddress: identity.postalAddress,
  };
}
