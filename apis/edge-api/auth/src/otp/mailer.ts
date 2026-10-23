/**
 * The sign-in code email, rendered and sent by `@effy/email-kit`. `auth-sign-in-code` throws on send
 * failure: a code never sent is a sign-in that cannot complete. Tests mock `@aws-sdk/client-sesv2`.
 */

import { sendEmail, resetMailerForTests } from "@effy/email-kit/send";

import type { AudienceProfile } from "../lib/audience.js";
import { OTP_TTL_SECONDS } from "./policy.js";

export interface SendCodeInput {
  readonly to: string;
  readonly code: string;
  readonly profile: AudienceProfile;
  /** Sends to the mailbox simulator instead of `to`. */
  readonly phantom: boolean;
}

/**
 * Throws on failure; the caller refuses opaquely. Logs neither the code nor the address. `phantom`
 * routes to the simulator on the same path, so latency reveals nothing.
 */
export async function sendCode(input: SendCodeInput): Promise<void> {
  await sendEmail(
    "auth-sign-in-code",
    {
      code: input.code,
      // Derived from the code's real lifetime.
      expiryMinutes: Math.floor(OTP_TTL_SECONDS / 60),
      isInternal: input.profile.internal,
    },
    { to: input.to, audience: input.profile.audience, phantom: input.phantom },
  );
}

export { resetMailerForTests };
