// 113: removes a customer's sign-in at erasure. IAM: cognito-idp:AdminDeleteUser on the customer pool only.
import {
  AdminDeleteUserCommand,
  CognitoIdentityProviderClient,
  UserNotFoundException,
} from "@aws-sdk/client-cognito-identity-provider"

let client: CognitoIdentityProviderClient | undefined

/**
 * `Username` may be the user's `sub` for a native user (and every customer is native: a Google identity is linked into
 * one, and goes with it). A user already gone counts as done, so a retried erasure never fails here.
 */
export async function deleteCustomerSignIn(sub: string, userPoolId = process.env.CUSTOMER_USER_POOL_ID): Promise<void> {
  if (!userPoolId) throw new Error("erasure: CUSTOMER_USER_POOL_ID is not set")
  client ??= new CognitoIdentityProviderClient({})
  try {
    await client.send(new AdminDeleteUserCommand({ UserPoolId: userPoolId, Username: sub }))
  } catch (err) {
    if (err instanceof UserNotFoundException) return
    throw err
  }
}
