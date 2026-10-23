import type { PreSignUpTriggerEvent, PreSignUpTriggerHandler } from "aws-lambda"

import { linkFederatedIdentity, type CognitoAdmin } from "../lib/account-linking"
import { cognitoAdmin } from "../lib/cognito"
import { logger } from "@effy/edge-shared"

/**
 * Links a Google identity to the existing native profile with the same email, in the one window before
 * Cognito creates a duplicate (`AdminLinkProviderForUser` cannot merge later). It refuses unless the
 * IdP asserts `email_verified === true`: linking on an unproven email is an account takeover. If that
 * check fails, fix the Terraform IdP mapping; never relax it.
 */
export const handler: PreSignUpTriggerHandler = async (event) => {
  switch (event.triggerSource) {
    case "PreSignUp_ExternalProvider":
      return handleFederated(event, cognitoAdmin())

    case "PreSignUp_SignUp":
      // Native self-registration: Cognito verifies the email itself, nothing to link. Auto-confirm is wired
      // but off (it lets someone squat an address) until shown to be needed. `autoVerifyEmail` is never set.
      if (process.env.AUTO_CONFIRM_SIGNUP === "true") {
        event.response.autoConfirmUser = true
        logger.info(
          { sub: event.userName },
          "pre-sign-up: auto-confirming (035 — email remains UNVERIFIED until a code is answered)",
        )
      }
      return event

    default:
      // The linking trigger's own AdminCreateUser coming back around.
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
      // "Google_1029384756" → provider Google, providerSub 1029384756
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
    // Fail closed: an error beats linking an attacker into someone's account.
    throw new Error(result.reason)
  }

  logger.info({ outcome: result.outcome }, "federated identity linked to native profile")

  // Proven at Google, so verified here too.
  event.response.autoConfirmUser = true
  event.response.autoVerifyEmail = true
  return event
}
