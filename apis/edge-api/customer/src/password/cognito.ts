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
 * The Cognito calls this slice makes — every one of them TOKEN-AUTHORIZED (012 research R4).
 *
 * ⚠⚠ THIS MODULE NEEDS NO IAM PERMISSIONS AT ALL, AND THAT IS THE HEADLINE. ⚠⚠
 *
 * AWS is explicit: "Amazon Cognito doesn't evaluate IAM policies in requests for this API
 * operation." Every command below is authorized by the CUSTOMER'S OWN ACCESS TOKEN, not by this
 * Lambda's execution role.
 *
 * So the service is RELAYING the customer's authority, never exercising its own. A compromised
 * customer Lambda still cannot touch an account whose token it does not hold. That is a materially
 * smaller blast radius than 009's shop provisioning, which genuinely required `AdminCreateUser` and
 * a pool-scoped IAM policy to match. Here there is nothing to scope, because there is nothing
 * granted.
 *
 * ⚠ DELIBERATELY ABSENT: `AdminSetUserPassword`.
 *
 * It would work, and it is the first thing everyone reaches for. It is also the wrong shape: it
 * makes the BACKEND the authorizer of a credential change rather than a relay of the customer's own
 * proof. A bug in that authorization check is precisely the account-takeover primitive this entire
 * slice exists to eliminate — so the slice does not build one. AWS separately advises against
 * setting passwords on federated profiles. `AdminSetUserPassword` remains available as an operator
 * break-glass, and nothing more.
 */

let client: CognitoIdentityProviderClient | undefined

function c(): CognitoIdentityProviderClient {
  client ??= new CognitoIdentityProviderClient({})
  return client
}

/**
 * Send the step-up code (FR-017). It GRANTS NOTHING — it only puts a code in the customer's inbox.
 *
 * ⚠ WHY THIS AND NOT A HOME-GROWN CODE: an attribute-verification code is a DIFFERENT KIND of code
 * from a sign-in OTP, so a sign-in code cannot be replayed here and vice versa. FR-018's
 * "single-purpose" requirement is therefore enforced by Cognito's own plumbing rather than by our
 * discipline — and Cognito already owns expiry, single-use, and rate limiting (FR-020). Rebuilding
 * that in a table would be more code and more ways to get it wrong.
 *
 * Side effect: it re-verifies the `email` attribute. Our customers are already verified, so this is
 * a no-op.
 */
export async function sendEmailVerificationCode(accessToken: string): Promise<string | undefined> {
  const res = await c().send(
    new GetUserAttributeVerificationCodeCommand({
      AccessToken: accessToken,
      AttributeName: "email",
    }),
  )
  // The masked destination Cognito chose (e.g. `j***@e***.com`). Never the full address.
  return res.CodeDeliveryDetails?.Destination
}

/** Consume the step-up code. Throws `CodeMismatchException` / `ExpiredCodeException` on failure. */
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
 * SET A FIRST PASSWORD — `PreviousPassword` OMITTED.
 *
 * ⚠⚠ THIS IS THE CALL THE WHOLE SLICE TURNS ON. READ BEFORE CHANGING. ⚠⚠
 *
 * Cognito's own API reference:
 *
 *   "The user's previous password is required IF THE USER HAS A PASSWORD. If the user has no
 *    password and only signs in with passwordless authentication options, YOU CAN OMIT THIS
 *    PARAMETER."
 *
 * Restated plainly: **Cognito will let any bearer of a valid access token silently plant a permanent
 * password on a passwordless account.** A borrowed phone, a shared laptop, a stolen token — a
 * TRANSIENT foothold becomes DURABLE, CREDENTIALED access, and an OTP-only customer would never
 * notice, because they never use a password.
 *
 * The safety is ENTIRELY OURS TO IMPOSE. Cognito will not do it for us. That is why this function
 * is `unsafe`-prefixed and why the ONLY caller (`service.ts`) verifies a freshly emailed code
 * IMMEDIATELY BEFORE invoking it, in the same request. **Never call this from anywhere else, and
 * never call it without a proven step-up code.**
 *
 * ⚠ Amplify CANNOT express this call — its `updatePassword()` asserts a non-empty `oldPassword`
 * client-side, before any network request. That is not a limitation we are working around for
 * convenience; it is the reason this operation must live on the backend at all.
 *
 * ⚠ UNPROVEN AGAINST OUR POOL (spike T001). Documented in two places by AWS; never actually asked of
 * the dev pool. If T001 refutes it, THIS FUNCTION is what changes — the service, the schema, and the
 * UI above it are deliberately insulated from that.
 */
export async function unsafeSetFirstPassword(
  accessToken: string,
  newPassword: string,
): Promise<void> {
  await c().send(
    new ChangePasswordCommand({
      AccessToken: accessToken,
      ProposedPassword: newPassword,
      // PreviousPassword: deliberately absent. See above.
    }),
  )
}

/**
 * Change an EXISTING password (FR-016).
 *
 * Cognito verifies `PreviousPassword` itself and answers `NotAuthorizedException` if it is wrong.
 * That is why no separate auth-flow call is needed to "check the old password first" — and why
 * `ADMIN_USER_PASSWORD_AUTH` stays disabled on the app client, as it should.
 */
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
 * End every session, on every device (FR-024).
 *
 * ⚠ ALL-OR-NOTHING, INCLUDING THE CURRENT DEVICE. Cognito has no "revoke all except this one", and
 * the other devices' refresh tokens cannot be enumerated in order to revoke them selectively. That
 * is why the spec's FR-024 was AMENDED during planning: "preserve the current session" was not
 * expressible, so the requirement was made STRONGER (everything goes) rather than quietly weaker
 * (nothing goes — ghost sessions forever).
 *
 * ⚠ AND IT IS NOT INSTANT. Revoking refresh tokens does NOT invalidate already-issued ID/access
 * tokens at our API Gateway JWT authorizer, which checks only signature and expiry and knows nothing
 * of revocation. A revoked session's token keeps working until it EXPIRES — up to 60 minutes on the
 * current pool config. FR-024a requires that window be STATED, not assumed to be zero. Do not tell a
 * customer they are "signed out everywhere, instantly". They are not (research R7).
 */
export async function globalSignOut(accessToken: string): Promise<void> {
  await c().send(new GlobalSignOutCommand({ AccessToken: accessToken }))
}

/**
 * Push the name onto the Cognito profile so the ID token's claims agree with the record (FR-008).
 *
 * The storefront header greets the customer from the token's `given_name` claim — deliberately,
 * because that costs zero backend calls on a cached page. So a name changed ONLY in the database
 * would not appear there until the token happened to refresh (up to an hour). Writing both keeps
 * them from drifting (research R11).
 */
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

/**
 * Complete account recovery (FR-022b).
 *
 * ⚠ UNAUTHENTICATED — no token, no IAM. That is not an oversight: the caller has no session, which
 * is the entire point of account recovery. They prove the INBOX instead, and Cognito checks the code.
 *
 * This exists on the backend (rather than in the browser, where Amplify would happily do it) for two
 * reasons that are really one: it is the only way to breach-screen the recovery password, and the
 * only way the platform ever learns that a password now exists. Left client-side, recovery silently
 * bypasses FR-022 and permanently corrupts `has_password` (research R6).
 */
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
