/**
 * Cognito `CustomMessage`: brands the messages Cognito sends itself (sign-up, reset, verification).
 * Must never throw: a throw fails the whole Cognito operation, so every failure returns the event
 * unmodified and Cognito sends its default. The code stays Cognito's `{####}` placeholder. Imports
 * the pure `@effy/email-kit` entrypoint only, so no SES client sits behind the 5 s wall.
 */

import { identityFromEnv, render, type Audience, type TemplateId } from "@effy/email-kit";

import { audienceForPool } from "../lib/audience.js";
import { emit } from "../lib/observability.js";
import type { CustomMessageEvent } from "../otp/types.js";

/** A narrow union: with the broad `TemplateId`, `VarsFor` would intersect every template's vars. */
type CognitoTemplateId =
  | "auth-sign-up-code"
  | "auth-password-reset-code"
  | "auth-email-verification-code"
  | "auth-step-up-code";

/**
 * Anything not listed passes through unbranded (AdminCreateUser is suppressed; unknown sources were
 * never reviewed). `CustomMessage_Authentication` is Cognito's MFA, not the custom sign-in code.
 */
/** The placeholder baked into our templates; if Cognito passes a different one we fall back. */
const EXPECTED_CODE_PLACEHOLDER = "{####}";

const TEMPLATE_FOR_TRIGGER: Readonly<Record<string, CognitoTemplateId>> = {
  CustomMessage_SignUp: "auth-sign-up-code",
  CustomMessage_ResendCode: "auth-sign-up-code",
  CustomMessage_ForgotPassword: "auth-password-reset-code",
  CustomMessage_VerifyUserAttribute: "auth-email-verification-code",
  CustomMessage_UpdateUserAttribute: "auth-email-verification-code",
  CustomMessage_Authentication: "auth-step-up-code",
};

// Compile-time proof that every id above is a real catalogue id.
const _idsAreCatalogued: readonly TemplateId[] = Object.values(TEMPLATE_FOR_TRIGGER);
void _idsAreCatalogued;

export const handler = async (event: CustomMessageEvent): Promise<CustomMessageEvent> => {
  try {
    const templateId = TEMPLATE_FOR_TRIGGER[event.triggerSource];
    if (!templateId) {
      // Expected pass-through: no fallback metric, or its alarm would cry wolf.
      return passThrough(event, "unmapped_trigger");
    }

    const profile = audienceForPool(event.userPoolId);
    if (!profile) {
      // Unknown pool: fail closed. Counted by `otp_unknown_pool`, not as a fallback.
      emit("otp_unknown_pool", event.userPoolId);
      return passThrough(event, "unknown_pool");
    }

    if (event.request.codeParameter !== EXPECTED_CODE_PLACEHOLDER) {
      // A different placeholder would never be substituted: a real fallback.
      return brandingFailed(event, "unexpected_code_placeholder");
    }

    const identity = identityFromEnv();
    const message = render(templateId, {}, profile.audience as Audience, identity);

    event.response.emailSubject = message.subject;
    // HTML only: CustomMessage has no text part.
    event.response.emailMessage = message.html;

    emit("custom_message_rendered", event.userPoolId);
    return event;
  } catch (err) {
    // Any failure returns the event unmodified; never rethrow. Counted as a branding failure.
    logFailure(event.triggerSource, err);
    return brandingFailed(event, "render_error");
  }
};

/** The only signal that a message which should be branded was not; it has an alarm. */
function brandingFailed(event: CustomMessageEvent, reason: string): CustomMessageEvent {
  emit("custom_message_fallback", event.userPoolId);
  return passThrough(event, reason);
}

/** Records why, without PII. */
function passThrough(event: CustomMessageEvent, reason: string): CustomMessageEvent {
  // eslint-disable-next-line no-console -- structured line; a concerning case also carries the metric.
  console.log(
    JSON.stringify({
      level: "warn",
      msg: "custom message not branded; Cognito default used",
      triggerSource: event.triggerSource,
      reason,
    }),
  );
  return event;
}

/** The error name only: never the request, the body or the address. */
function logFailure(triggerSource: string, err: unknown): void {
  const name = err instanceof Error ? err.name : "UnknownError";
  // eslint-disable-next-line no-console -- structured line; the metric carries the alarm.
  console.log(
    JSON.stringify({ level: "error", msg: "custom message render failed", triggerSource, error: name }),
  );
}
