/**
 * Audience → how a message addresses that person, and where a reply goes.
 *
 * Extends the profile `apis/edge-api/auth/src/lib/audience.ts` already keeps (which carries only a
 * product name and an `internal` flag) with what email needs.
 *
 * ⚠ THE REPLY ADDRESS IS DERIVED, NEVER PASSED IN. A send site cannot choose it, which is what makes
 * it structurally impossible to introduce a third address (constitution: Real-World Identifiers —
 * only `hello@` and `workspace-admin@` are approved, and the distinction is what the address
 * *communicates*, since both land in one inbox).
 *
 * ⚠ AND THE TWO ADDRESSES ARE NOT LITERALS HERE EITHER. They arrive from the SSM contract 037
 * established (`/effy/<env>/ses/*`), because the platform already had this exact value hardcoded in
 * three places in two different shapes, and they had already drifted. One writer, many readers.
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
    // ⚠ Fail closed. Guessing a default would mean sending on behalf of an audience nobody
    // reviewed — the same rule `audience.ts` already applies to an unknown pool id.
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
  /** ⚠ Operator-supplied — from `/effy/<env>/mail/postal_address`. Never inferred. */
  readonly postalAddress: string;
}

/** ⚠ Derived, never chosen: internal audiences reply to the operational mailbox. */
export function replyAddressFor(profile: AudienceProfile, identity: MailIdentity): string {
  return profile.internal ? identity.replyToInternal : identity.replyToPublic;
}

/**
 * The values every template's layout consumes. ⚠ Platform-injected: a call site supplies none of
 * these, which is why the footer is the same footer in every message.
 */
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
