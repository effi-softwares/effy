/** One person is one `sub`; two identities are linked only when the IdP proves the email. Free of the AWS SDK. */

export interface CognitoAdmin {
  /** A native (non-federated) profile's Cognito username, or null. */
  findNativeUserByEmail(userPoolId: string, email: string): Promise<string | null>
  /** No password (stays passwordless-capable) and no invite. */
  createNativeUser(userPoolId: string, email: string): Promise<string>
  linkProvider(input: {
    userPoolId: string
    destinationUsername: string
    providerName: string
    providerSub: string
  }): Promise<void>
}

export interface FederatedSignUp {
  userPoolId: string
  /** e.g. "Google_1029384756". */
  federatedUsername: string
  email: string | undefined
  /** Cognito passes attributes as strings. */
  emailVerified: string | undefined
}

export type LinkResult =
  | { outcome: "linked-to-existing" }
  | { outcome: "created-and-linked" }
  | { outcome: "refused"; reason: string }

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

  // No email: nothing to match on.
  if (!input.email) {
    return {
      outcome: "refused",
      reason: "This provider did not supply an email address, so we cannot identify the account.",
    }
  }

  // The IdP must assert it verified the address, or an attacker could be linked into the victim's
  // account. If real Google users fail here, the Terraform IdP's `email_verified` mapping is missing.
  if (input.emailVerified !== "true") {
    return {
      outcome: "refused",
      reason:
        "This provider has not verified ownership of the email address, so we cannot link it to an Effy account.",
    }
  }

  const email = normaliseEmail(input.email)

  // The native profile is always the destination: it preserves `sub`, and Cognito cannot merge afterwards.
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

export function normaliseEmail(email: string): string {
  return email.trim().toLowerCase()
}
