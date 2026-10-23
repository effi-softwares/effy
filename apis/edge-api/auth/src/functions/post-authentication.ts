/**
 * Cognito `PostAuthentication`: reinstates `email_verified`, which managed EMAIL_OTP would set but
 * CUSTOM_AUTH does not. Without it accounts silently stay unverified and Google linking (rightly)
 * refuses. Here rather than in verify: only this trigger means the sign-in completed.
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
  // Already verified: no round trip.
  if (event.request.userAttributes?.["email_verified"] === "true") return event;

  // A federated or admin-created account may arrive without the attribute.
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
    // Must not throw (the sign-in succeeded) and must not be silent: the metric is the only signal.
    emit("otp_email_verify_failed", event.userPoolId);
  }

  return event;
};

export function resetPostAuthForTests(): void {
  client = undefined;
}
