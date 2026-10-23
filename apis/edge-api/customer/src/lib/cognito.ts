import {
  AdminCreateUserCommand,
  AdminLinkProviderForUserCommand,
  CognitoIdentityProviderClient,
  ListUsersCommand,
} from "@aws-sdk/client-cognito-identity-provider"

import type { CognitoAdmin } from "./account-linking"

/** The AWS side of account linking; every decision is in `account-linking.ts`. IAM is scoped to the customer pool. */
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

      // The native profile (federated ones carry `identities`): it must be the link destination.
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
          // No TemporaryPassword: setting one would make them a password user.
          MessageAction: "SUPPRESS",
          UserAttributes: [
            { Name: "email", Value: email },
            // Proven at Google; unverified identities were refused in account-linking.ts.
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
          DestinationUser: {
            ProviderName: "Cognito",
            ProviderAttributeValue: destinationUsername,
          },
          SourceUser: {
            ProviderName: providerName,
            // For social IdPs this must be the literal "Cognito_Subject".
            ProviderAttributeName: "Cognito_Subject",
            ProviderAttributeValue: providerSub,
          },
        }),
      )
    },
  }
}
