import type { PreSignUpTriggerEvent, PreSignUpTriggerHandler } from "aws-lambda"

import { linkFederatedIdentity, type CognitoAdmin } from "../lib/account-linking"
import { cognitoAdmin } from "../lib/cognito"
import { logger } from "@effy/edge-shared"

/**
 * THE ACCOUNT-LINKING TRIGGER (FR-011, FR-012).
 *
 * WHAT IT PREVENTS
 * ----------------
 * Left alone, Cognito creates a SEPARATE profile (`Google_<sub>`) the first time someone signs in
 * with Google — distinct from the native profile they already have with the same email. That is a
 * DUPLICATE ACCOUNT: two profiles, two `sub`s, two customer records. And it is unrecoverable —
 * `AdminLinkProviderForUser` requires that the federated user NOT YET EXIST, so there is no
 * retroactive merge. Once Cognito has auto-created that profile, that person is permanently two
 * people to the platform.
 *
 * So the linking has to happen HERE, in the one window before the profile is created.
 *
 * WHAT IT MUST NOT BECOME
 * -----------------------
 * ⚠⚠ Linking two identities because their emails match is an ACCOUNT-TAKEOVER PRIMITIVE unless
 * the email is PROVEN. The attack, in full:
 *
 *   1. The victim has an Effy account, victim@example.com.
 *   2. The attacker registers victim@example.com at an identity provider that does not verify
 *      ownership of the address.
 *   3. The attacker federates into our pool. We see a matching email and link their identity to
 *      the victim's profile.
 *   4. The attacker now signs in and receives JWTs CARRYING THE VICTIM'S `sub`. Complete takeover.
 *      No password. No OTP. No trace in any log that says "attack".
 *
 * AWS states it plainly: "it is critical that it only be used with external IdPs and provider
 * attributes that have been trusted by the application owner."
 *
 * The defence is the very first thing this function does: REFUSE TO LINK unless the IdP asserts
 * `email_verified === true`. That check is not a validation nicety and must never be relaxed to
 * "make Google sign-in work" — if it is failing, the mapping in the Terraform IdP is missing, and
 * THAT is the bug.
 */
export const handler: PreSignUpTriggerHandler = async (event) => {
  switch (event.triggerSource) {
    case "PreSignUp_ExternalProvider":
      return handleFederated(event, cognitoAdmin())

    case "PreSignUp_SignUp":
      // A native self-registration (password or email OTP). Cognito verifies the email itself via
      // the confirmation code, so there is nothing to link and nothing to decide.
      return event

    default:
      // PreSignUp_AdminCreateUser — the customer pool is open to self-signup, so this is the
      // linking trigger's own AdminCreateUser call coming back around. Pass it through.
      return event
  }
}

async function handleFederated(
  event: PreSignUpTriggerEvent,
  admin: CognitoAdmin,
): Promise<PreSignUpTriggerEvent> {
  const { email, email_verified } = event.request.userAttributes

  const result = await linkFederatedIdentity(
    {
      userPoolId: event.userPoolId,
      // e.g. "Google_1029384756" → provider = Google, providerSub = 1029384756
      federatedUsername: event.userName,
      email,
      emailVerified: email_verified,
    },
    admin,
  )

  if (result.outcome === "refused") {
    logger.warn(
      { reason: result.reason },
      "federated sign-in REFUSED — refusing to link an unverified identity",
    )
    // Throwing fails the sign-in. That is the correct, fail-closed behaviour: we would rather a
    // legitimate customer see an error than link an attacker into someone else's account.
    throw new Error(result.reason)
  }

  logger.info({ outcome: result.outcome }, "federated identity linked to native profile")

  // The customer proved control of this address at Google, so it is verified here too, and there
  // is nothing further for them to confirm.
  event.response.autoConfirmUser = true
  event.response.autoVerifyEmail = true
  return event
}
