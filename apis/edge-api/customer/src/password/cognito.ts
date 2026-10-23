import {
  ChangePasswordCommand,
  CognitoIdentityProviderClient,
  ConfirmForgotPasswordCommand,
  GetUserAttributeVerificationCodeCommand,
  GlobalSignOutCommand,
  UpdateUserAttributesCommand,
  VerifyUserAttributeCommand,
} from "@aws-sdk/client-cognito-identity-provider"

/**
 * Every call is authorized by the customer's own access token, so this module needs no IAM: it relays
 * the customer's authority and never exercises its own. `AdminSetUserPassword` is deliberately absent:
 * it would make the backend the authorizer of a credential change.
 */

let client: CognitoIdentityProviderClient | undefined

function c(): CognitoIdentityProviderClient {
  client ??= new CognitoIdentityProviderClient({})
  return client
}

/**
 * Grants nothing. An attribute-verification code is a different kind from a sign-in code, so neither
 * replays as the other, and Cognito owns expiry, single use and rate limiting.
 */
export async function sendEmailVerificationCode(accessToken: string): Promise<string | undefined> {
  const res = await c().send(
    new GetUserAttributeVerificationCodeCommand({
      AccessToken: accessToken,
      AttributeName: "email",
    }),
  )
  // The masked destination Cognito chose. Never the full address.
  return res.CodeDeliveryDetails?.Destination
}

/** Throws `CodeMismatchException` / `ExpiredCodeException`. */
export async function verifyEmailCode(accessToken: string, code: string): Promise<void> {
  await c().send(
    new VerifyUserAttributeCommand({
      AccessToken: accessToken,
      AttributeName: "email",
      Code: code,
    }),
  )
}

/**
 * Sets a first password with `PreviousPassword` omitted, which Cognito allows for any bearer of a valid
 * access token on a passwordless account: a borrowed session would become a permanent credential. The
 * only caller (`service.ts`) verifies a freshly emailed code immediately before, in the same request.
 * Never call it otherwise. (Amplify cannot express this call, hence the backend.)
 */
export async function unsafeSetFirstPassword(
  accessToken: string,
  newPassword: string,
): Promise<void> {
  await c().send(
    new ChangePasswordCommand({
      AccessToken: accessToken,
      ProposedPassword: newPassword,
    }),
  )
}

/** Cognito verifies `PreviousPassword` itself (`NotAuthorizedException`). */
export async function changePassword(
  accessToken: string,
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  await c().send(
    new ChangePasswordCommand({
      AccessToken: accessToken,
      PreviousPassword: currentPassword,
      ProposedPassword: newPassword,
    }),
  )
}

/**
 * All-or-nothing, the current device included. Not instant: issued tokens keep working until they
 * expire (up to 60 minutes), so never claim "signed out everywhere, instantly".
 */
export async function globalSignOut(accessToken: string): Promise<void> {
  await c().send(new GlobalSignOutCommand({ AccessToken: accessToken }))
}

/** The storefront greets from the ID token's `given_name`, so the name is written to both. */
export async function updateName(
  accessToken: string,
  givenName: string | null,
  familyName: string | null,
): Promise<void> {
  await c().send(
    new UpdateUserAttributesCommand({
      AccessToken: accessToken,
      UserAttributes: [
        { Name: "given_name", Value: givenName ?? "" },
        { Name: "family_name", Value: familyName ?? "" },
      ],
    }),
  )
}

/** Unauthenticated: the caller proves the inbox. On the backend so the password is breach-screened and `has_password` updated. */
export async function confirmForgotPassword(
  clientId: string,
  email: string,
  code: string,
  newPassword: string,
): Promise<void> {
  await c().send(
    new ConfirmForgotPasswordCommand({
      ClientId: clientId,
      Username: email,
      ConfirmationCode: code,
      Password: newPassword,
    }),
  )
}
