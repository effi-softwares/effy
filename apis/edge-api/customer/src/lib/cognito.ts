import {
  AdminCreateUserCommand,
  AdminLinkProviderForUserCommand,
  CognitoIdentityProviderClient,
  ListUsersCommand,
} from "@aws-sdk/client-cognito-identity-provider"

import type { CognitoAdmin } from "./account-linking"

/**
 * The AWS side of account linking. Deliberately thin: every decision — above all the refusal to
 * link an unverified identity — lives in `account-linking.ts`, where it is unit-tested.
 *
 * This is an authorized ADMINISTRATIVE write against the customer pool, in the same shape as
 * 006's first-admin bootstrap and 009's shop-user provisioning. It is not cross-pool auth, and
 * Principle IV is intact: the IAM policy is scoped to the customer pool ARN alone.
 */
let client: CognitoIdentityProviderClient | undefined

export function cognitoAdmin(): CognitoAdmin {
  client ??= new CognitoIdentityProviderClient({})
  const c = client

  return {
    async findNativeUserByEmail(userPoolId, email) {
      const res = await c.send(
        new ListUsersCommand({
          UserPoolId: userPoolId,
          Filter: `email = "${email}"`,
          Limit: 2,
        }),
      )

      // A federated profile carries an `identities` attribute. We want the NATIVE one — it must
      // be the link destination, or `sub` does not survive (see account-linking.ts).
      const native = (res.Users ?? []).find(
        (u) => !u.Attributes?.some((a) => a.Name === "identities"),
      )
      return native?.Username ?? null
    },

    async createNativeUser(userPoolId, email) {
      const res = await c.send(
        new AdminCreateUserCommand({
          UserPoolId: userPoolId,
          Username: email,
          // No TemporaryPassword: the customer never had a password and must stay
          // passwordless-capable. Setting one here would quietly make them a password user.
          MessageAction: "SUPPRESS", // they are mid-sign-in with Google; do not email them a code
          UserAttributes: [
            { Name: "email", Value: email },
            // They proved control of this address at Google — Gate 2 in account-linking.ts
            // already refused anything the IdP had not verified.
            { Name: "email_verified", Value: "true" },
          ],
        }),
      )
      const username = res.User?.Username
      if (!username) throw new Error("AdminCreateUser returned no username")
      return username
    },

    async linkProvider({ userPoolId, destinationUsername, providerName, providerSub }) {
      await c.send(
        new AdminLinkProviderForUserCommand({
          UserPoolId: userPoolId,
          // The NATIVE profile. Always. This is what preserves `sub`.
          DestinationUser: {
            ProviderName: "Cognito",
            ProviderAttributeValue: destinationUsername,
          },
          SourceUser: {
            ProviderName: providerName,
            // For social IdPs this MUST be the literal string "Cognito_Subject".
            ProviderAttributeName: "Cognito_Subject",
            ProviderAttributeValue: providerSub,
          },
        }),
      )
    },
  }
}
