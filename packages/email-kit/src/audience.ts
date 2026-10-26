export type Audience = "customer" | "driver" | "shop" | "back-office";

export interface AudienceProfile {
  readonly audience: Audience;
  readonly productName: string;
  readonly internal: boolean;
}

const PROFILES: Record<Audience, AudienceProfile> = {
  customer: { audience: "customer", productName: "Effy", internal: false },
  driver: { audience: "driver", productName: "Effy Driver", internal: true },
  shop: { audience: "shop", productName: "Effy Shop", internal: true },
  "back-office": { audience: "back-office", productName: "Effy Back-Office", internal: true },
};

export function profileFor(audience: Audience): AudienceProfile {
  const profile = PROFILES[audience];
  if (!profile) throw new Error(`email-kit: unknown audience '${String(audience)}'`);
  return profile;
}

export interface MailIdentity {
  readonly sender: string;
  readonly replyToPublic: string;
  readonly replyToInternal: string;
  readonly postalAddress: string;
}

export function replyAddressFor(profile: AudienceProfile, identity: MailIdentity): string {
  return profile.internal ? identity.replyToInternal : identity.replyToPublic;
}

export function platformVars(profile: AudienceProfile, identity: MailIdentity): Record<string, string> {
  return {
    effyProductName: profile.productName,
    effySupportEmail: replyAddressFor(profile, identity),
    effyPostalAddress: identity.postalAddress,
  };
}
