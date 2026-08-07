/**
 * Cognito `CustomMessage` — brand the four messages Cognito sends itself (038).
 *
 * Cognito, not the platform, sends sign-up confirmation, password reset, email verification and MFA.
 * Left alone they arrive as Cognito's unbranded defaults — and sign-up confirmation is the FIRST
 * email every new customer ever receives. This trigger renders each in the Effy design and hands the
 * HTML back to Cognito, which substitutes the code and sends.
 *
 * ⚠⚠ THIS TRIGGER MUST NEVER THROW. ⚠⚠
 * A CustomMessage trigger that throws fails the ENTIRE Cognito operation — sign-up does not complete,
 * password recovery does not complete. So every path here is caught and, on any failure, the event is
 * returned UNMODIFIED, which makes Cognito fall back to its own default template. The person gets a
 * plain message instead of a designed one; they never get a broken flow (spec FR-055 / SC-018).
 *
 * ⚠ THE CODE IS `{####}`, AND THE PLATFORM NEVER SEES THE REAL ONE. `request.codeParameter` holds the
 * placeholder; Cognito substitutes it after we return. The templates emit it verbatim. That is a
 * security property — a branded message without custody of a credential — not a limitation.
 *
 * ⚠ RENDER-ONLY, NO SES. This handler imports from `@effy/email-kit` (the pure entrypoint), never
 * `/send`, so the SES client stays out of a Lambda that also sits behind Cognito's 5-second wall.
 */

import { identityFromEnv, render, type Audience, type TemplateId } from "@effy/email-kit";

import { audienceForPool } from "../lib/audience.js";
import { emit } from "../lib/observability.js";
import type { CustomMessageEvent } from "../otp/types.js";

/**
 * ⚠ The Cognito-sent template ids, as a NARROW union — not the broad `TemplateId`.
 *
 * This is load-bearing for type safety, not cosmetic. Indexing the catalogue with the broad union
 * makes `VarsFor` the INTERSECTION of every template's variables (all required), so `render(id, {})`
 * would not compile. Every id here has empty vars, so `VarsFor<CognitoTemplateId>` is `{}` and `{}`
 * is a valid payload. Each literal is a member of the catalogue's `TemplateId` union, so the narrow
 * type is a provable subtype of it.
 */
type CognitoTemplateId =
  | "auth-sign-up-code"
  | "auth-password-reset-code"
  | "auth-email-verification-code"
  | "auth-step-up-code";

/**
 * `triggerSource` → the template to render. Anything not listed passes through untouched, on purpose:
 *  - `CustomMessage_AdminCreateUser` — should not fire (internal audiences are provisioned with
 *    MessageAction: SUPPRESS, 006), but "should not fire" is a belief about configuration, not a
 *    guarantee; leaving it unbranded is safe, breaking it is not.
 *  - any future source — an unknown trigger is Cognito adding a capability this code was never
 *    reviewed against.
 *
 * ⚠ `CustomMessage_Authentication` is Cognito's NATIVE MFA — NOT the passwordless sign-in code, which
 * is 035's custom challenge and is sent by the platform as `auth-sign-in-code`.
 */
/**
 * ⚠ The code placeholder our templates BAKE IN. Cognito substitutes it after we return.
 *
 * AWS has used `{####}` for email codes for a decade, but the placeholder is documented as Cognito's
 * to choose — so we do not blindly assume it. The handler compares this against the placeholder
 * Cognito actually passes (`request.codeParameter`); if they differ, the baked-in `{####}` would
 * never be substituted and the message would ship a literal placeholder with no code, so we fall
 * back to Cognito's default instead. Baking the literal (rather than injecting `codeParameter`) is
 * what lets the compiled artifact be lint-checked for the placeholder and rendered with empty vars.
 */
const EXPECTED_CODE_PLACEHOLDER = "{####}";

const TEMPLATE_FOR_TRIGGER: Readonly<Record<string, CognitoTemplateId>> = {
  CustomMessage_SignUp: "auth-sign-up-code",
  CustomMessage_ResendCode: "auth-sign-up-code",
  CustomMessage_ForgotPassword: "auth-password-reset-code",
  CustomMessage_VerifyUserAttribute: "auth-email-verification-code",
  CustomMessage_UpdateUserAttribute: "auth-email-verification-code",
  CustomMessage_Authentication: "auth-step-up-code",
};

// ⚠ Compile-time proof that every id above is a real catalogue id — a typo here would otherwise only
// surface when a customer's sign-up silently fell back to Cognito's default.
const _idsAreCatalogued: readonly TemplateId[] = Object.values(TEMPLATE_FOR_TRIGGER);
void _idsAreCatalogued;

export const handler = async (event: CustomMessageEvent): Promise<CustomMessageEvent> => {
  try {
    const templateId = TEMPLATE_FOR_TRIGGER[event.triggerSource];
    if (!templateId) {
      // ⚠ BENIGN. AdminCreateUser (suppressed, so it should not even fire) or a Cognito trigger
      // source we do not brand. Passing through is the correct, expected behaviour — NOT a fault, so
      // it does NOT emit `custom_message_fallback`. Alarming on this would cry wolf on every
      // un-branded flow and train the operator to ignore the metric.
      return passThrough(event, "unmapped_trigger");
    }

    const profile = audienceForPool(event.userPoolId);
    if (!profile) {
      // ⚠ Fail closed on a pool this code was never reviewed against — never guess an audience.
      // Already covered by the `otp_unknown_pool` metric + its alarm; not double-counted as a
      // fallback.
      emit("otp_unknown_pool", event.userPoolId);
      return passThrough(event, "unknown_pool");
    }

    if (event.request.codeParameter !== EXPECTED_CODE_PLACEHOLDER) {
      // ⚠ Cognito's placeholder differs from the one our template baked in — the code would not be
      // substituted. This IS a concerning fallback: a message we should have branded cannot be.
      return brandingFailed(event, "unexpected_code_placeholder");
    }

    // ⚠ Pure render. Vars are empty — the code is Cognito's `{####}`, the footer is platform-injected
    // from the identity + audience. `identityFromEnv` reads only the environment (no SES).
    const identity = identityFromEnv();
    const message = render(templateId, {}, profile.audience as Audience, identity);

    event.response.emailSubject = message.subject;
    // ⚠ HTML ONLY. CustomMessage has no text-part field; Cognito owns the MIME assembly. The
    // template's plain-text part exists for catalogue uniformity and is simply unused on this path.
    event.response.emailMessage = message.html;

    emit("custom_message_rendered", event.userPoolId);
    return event;
  } catch (err) {
    // ⚠ THE TOTAL FAIL-SAFE. Anything at all — an audience the template does not serve, a render
    // failure, a missing MAIL_SENDER, an oversize output Cognito would reject — returns unmodified.
    // There is NO rethrow: a throw here breaks sign-up and password recovery for a real person. This
    // is a message we SHOULD have branded, so it counts as a branding failure and alarms.
    logFailure(event.triggerSource, err);
    return brandingFailed(event, "render_error");
  }
};

/**
 * A message we were SUPPOSED to brand could not be rendered. ⚠ This is the one blind spot this slice
 * introduces: the person still gets a working (unbranded) message, so nothing else signals it — the
 * `custom_message_fallback` metric is the only signal, and it has an alarm. Distinct from a benign
 * pass-through, which emits nothing.
 */
function brandingFailed(event: CustomMessageEvent, reason: string): CustomMessageEvent {
  emit("custom_message_fallback", event.userPoolId);
  return passThrough(event, reason);
}

/** Return the event unmodified so Cognito uses its default template; record why (no PII). */
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

/**
 * ⚠ The error NAME only. Never `event.request` (it carries the recipient's attributes), never the
 * rendered body, never the address. Same discipline as create-auth-challenge's logFailure.
 */
function logFailure(triggerSource: string, err: unknown): void {
  const name = err instanceof Error ? err.name : "UnknownError";
  // eslint-disable-next-line no-console -- structured line; the metric carries the alarm.
  console.log(
    JSON.stringify({ level: "error", msg: "custom message render failed", triggerSource, error: name }),
  );
}
