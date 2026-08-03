/**
 * Cognito `PostAuthentication` — reinstate `email_verified` (035 FR-020).
 *
 * ⚠ THIS IS THE MOST LIKELY SILENT FAILURE IN THE WHOLE SLICE, and it exists because of a
 * behaviour we are GIVING UP rather than one we are adding.
 *
 * Managed passwordless EMAIL_OTP marks the address verified and moves a new account from
 * UNCONFIRMED to CONFIRMED when someone enters a correct code. AWS scopes that explicitly to
 * passwordless authentication and email MFA — CUSTOM_AUTH is on neither list. From Cognito's point
 * of view our challenge is an opaque Lambda verdict; it has no idea an email was involved.
 *
 * Miss this and NOTHING BREAKS VISIBLY. Accounts simply accumulate with `email_verified: false`,
 * and the failure only surfaces later when a shopper tries Google sign-in and linking refuses —
 * which, under constitution Principle IV, it must, because linking on an unverified email is an
 * account-takeover primitive.
 *
 * ⚠ WHY HERE AND NOT IN `VerifyAuthChallengeResponse`: this is the only point that unambiguously
 * means "the sign-in completed". The verify trigger can return `true` on an attempt that
 * `DefineAuthChallenge` then declines to issue tokens for. Keeping the write out of verify also
 * keeps that function pure, which is what makes its constant-time compare auditable.
 */

import {
  AdminUpdateUserAttributesCommand,
  CognitoIdentityProviderClient,
} from "@aws-sdk/client-cognito-identity-provider";
import { emit } from "../lib/observability.js";
import type { PostAuthenticationEvent } from "../otp/types.js";

let client: CognitoIdentityProviderClient | undefined;

function cognito(): CognitoIdentityProviderClient {
  client ??= new CognitoIdentityProviderClient({});
  return client;
}

export const handler = async (
  event: PostAuthenticationEvent,
): Promise<PostAuthenticationEvent> => {
  // Idempotent by check: already-verified accounts (every existing user, and every subsequent
  // sign-in) do no work and cost no round trip inside the 5-second wall.
  if (event.request.userAttributes?.["email_verified"] === "true") return event;

  // Nothing to verify. Not an error — a federated or admin-created account may legitimately
  // arrive here without the attribute.
  if (!event.request.userAttributes?.["email"]) return event;

  try {
    await cognito().send(
      new AdminUpdateUserAttributesCommand({
        UserPoolId: event.userPoolId,
        Username: event.userName,
        UserAttributes: [{ Name: "email_verified", Value: "true" }],
      }),
    );
  } catch {
    // ⚠ MUST NOT THROW. The sign-in has already succeeded; failing the trigger here would fail an
    // authentication that legitimately completed, turning a bookkeeping problem into a lockout.
    // ⚠ But it MUST NOT be silent either — this metric is the only signal that accounts are
    // drifting into the unverified state that breaks Google linking weeks later.
    emit("otp_email_verify_failed", event.userPoolId);
  }

  return event;
};

/** Test seam. */
export function resetPostAuthForTests(): void {
  client = undefined;
}
