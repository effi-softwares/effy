/**
 * Account linking — the decision logic, kept free of the AWS SDK so it can be tested hard.
 *
 * The rule, in one line: ONE PERSON IS ONE `sub`, and we will only believe two identities are the
 * same person if the identity provider PROVES the email.
 */

export interface CognitoAdmin {
  /** Find a native (non-federated) profile by email. Returns its Cognito username, or null. */
  findNativeUserByEmail(userPoolId: string, email: string): Promise<string | null>
  /** Create a native profile with NO password (keeps them passwordless-capable) and no invite. */
  createNativeUser(userPoolId: string, email: string): Promise<string>
  /** Link a federated identity INTO a native profile. */
  linkProvider(input: {
    userPoolId: string
    destinationUsername: string
    providerName: string
    providerSub: string
  }): Promise<void>
}

export interface FederatedSignUp {
  userPoolId: string
  /** Cognito's name for the incoming federated user, e.g. "Google_1029384756". */
  federatedUsername: string
  email: string | undefined
  /** The IdP's assertion, as a string — Cognito passes attributes as strings. */
  emailVerified: string | undefined
}

export type LinkResult =
  | { outcome: "linked-to-existing" }
  | { outcome: "created-and-linked" }
  | { outcome: "refused"; reason: string }

/** Split "Google_12345" into its provider and the provider's subject id. */
export function parseFederatedUsername(
  username: string,
): { provider: string; sub: string } | null {
  const i = username.indexOf("_")
  if (i <= 0 || i === username.length - 1) return null
  return { provider: username.slice(0, i), sub: username.slice(i + 1) }
}

export async function linkFederatedIdentity(
  input: FederatedSignUp,
  admin: CognitoAdmin,
): Promise<LinkResult> {
  const parsed = parseFederatedUsername(input.federatedUsername)
  if (!parsed) {
    return {
      outcome: "refused",
      reason: "Unrecognised federated identity.",
    }
  }

  // ── GATE 1 ─────────────────────────────────────────────────────────────────────────────────
  // No email → nothing to match on. We do not guess.
  if (!input.email) {
    return {
      outcome: "refused",
      reason: "This provider did not supply an email address, so we cannot identify the account.",
    }
  }

  // ── GATE 2 — THE SECURITY CONTROL (FR-012). ────────────────────────────────────────────────
  // The IdP must ASSERT that it verified this address. Without this, an attacker who registers a
  // victim's email at a provider that does not check ownership can be linked into the victim's
  // account and receive JWTs carrying the victim's `sub`.
  //
  // ⚠ If this fires for real Google users, the bug is a MISSING `email_verified` MAPPING on the
  // Terraform identity provider — not this check. Do not relax it to "make sign-in work".
  if (input.emailVerified !== "true") {
    return {
      outcome: "refused",
      reason:
        "This provider has not verified ownership of the email address, so we cannot link it to an Effy account.",
    }
  }

  const email = normaliseEmail(input.email)

  // ── The link itself ────────────────────────────────────────────────────────────────────────
  // ⚠ THE NATIVE PROFILE IS ALWAYS THE DESTINATION. That is what preserves `sub` across every
  // credential route, and `sub` is the key of `public.customer`. If Cognito is ever allowed to
  // auto-create the `Google_…` profile instead, that person becomes two accounts permanently —
  // linking requires the federated user NOT to exist, so there is no merge afterwards.
  const existing = await admin.findNativeUserByEmail(input.userPoolId, email)

  const destinationUsername =
    existing ?? (await admin.createNativeUser(input.userPoolId, email))

  await admin.linkProvider({
    userPoolId: input.userPoolId,
    destinationUsername,
    providerName: parsed.provider,
    providerSub: parsed.sub,
  })

  return { outcome: existing ? "linked-to-existing" : "created-and-linked" }
}

/** Cognito treats email as a case-insensitive alias; so do we, everywhere. */
export function normaliseEmail(email: string): string {
  return email.trim().toLowerCase()
}
