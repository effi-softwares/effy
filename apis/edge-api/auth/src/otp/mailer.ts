/**
 * The sign-in code email (035), since 038 rendered by `@effy/email-kit`.
 *
 * ⚠ THIS FILE IS NOW A THIN ADAPTER. The message's content, design, subject, escaping, size budget
 * and send mechanism all live in `@effy/email-kit` — the platform's one email system (038). What
 * remains here is the shape the trigger already calls (`sendCode({ to, code, profile, phantom })`)
 * and the mapping from this path's `AudienceProfile` to the catalogue's variables. No HTML, no SES
 * client, and no copy is authored here any more; the inline `string[]` body that lived here is gone.
 *
 * ⚠ THE FAILURE CONTRACT IS UNCHANGED, and now enforced by the catalogue rather than by this file.
 * `auth-sign-in-code` is declared `onSendFailure: "throw"`, so a failed send still throws and the
 * caller still turns it into an opaque refusal — because a code that was never sent is a sign-in
 * that cannot complete, and three of the four audiences have no password fallback.
 *
 * ⚠ THE MOCK SEAM IS PRESERVED. Tests `vi.mock("@aws-sdk/client-sesv2")`; `@effy/email-kit/send`
 * constructs the same client, so the mock still intercepts the send. `resetMailerForTests` is
 * re-exported so the container-scoped client can be reset between tests, exactly as before.
 */

import { sendEmail, resetMailerForTests } from "@effy/email-kit/send";

import type { AudienceProfile } from "../lib/audience.js";
import { OTP_TTL_SECONDS } from "./policy.js";

export interface SendCodeInput {
  readonly to: string;
  readonly code: string;
  readonly profile: AudienceProfile;
  /** When true, the message goes to the mailbox simulator instead of `to`. */
  readonly phantom: boolean;
}

/**
 * ⚠ THROWS on send failure, by design (the catalogue's `throw` policy). The caller turns that into
 * an opaque refusal — never into an error string, which Cognito relays to the client verbatim.
 *
 * ⚠ Never logs `input.code`, and never logs `input.to` (FR-014). No logger is passed to
 * `sendEmail`, so it emits nothing; the caller owns this path's observability via `emit()`.
 *
 * ⚠ The phantom → mailbox-simulator routing (035's timing-parity defence) is preserved: it is now
 * `options.phantom`, which `sendEmail` maps to the same simulator address on the same code path, so
 * account existence cannot leak through latency.
 */
export async function sendCode(input: SendCodeInput): Promise<void> {
  await sendEmail(
    "auth-sign-in-code",
    {
      code: input.code,
      // ⚠ Derived from the SAME constant that governs the code's real lifetime — a message claiming
      // five minutes while the code lasts ten is a support ticket the platform generates itself.
      expiryMinutes: Math.floor(OTP_TTL_SECONDS / 60),
      isInternal: input.profile.internal,
    },
    { to: input.to, audience: input.profile.audience, phantom: input.phantom },
  );
}

/** Test seam — re-exported so tests can reset the container-scoped SES client. */
export { resetMailerForTests };
