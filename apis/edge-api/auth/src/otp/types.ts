/**
 * Trigger event shapes for the custom-auth challenge flow (035).
 *
 * ⚠ WHY THESE ARE DECLARED LOCALLY RATHER THAN IMPORTED WHOLESALE.
 * `@types/aws-lambda@8.10.162` ships a CLOSED union for `challengeName`:
 *
 *     "PASSWORD_VERIFIER" | "SMS_MFA" | "DEVICE_SRP_AUTH"
 *   | "DEVICE_PASSWORD_VERIFIER" | "ADMIN_NO_SRP_AUTH" | "SRP_A"
 *
 * That union is STALE — the AWS docs additionally list `EMAIL_OTP`, `CUSTOM_CHALLENGE` and
 * `NEW_PASSWORD_REQUIRED`, and the two Cognito doc pages do not even agree with each other on the
 * set. AWS warns explicitly that "element names might be added… stricter input validation can cause
 * your functions to fail."
 *
 * A closed union here would be worse than useless: it would compile today and reject a value AWS
 * starts sending tomorrow, on the sign-in path, for every audience at once. So `challengeName` is
 * an open `string` and every comparison against it is explicit.
 */

/** A single completed challenge in the authentication session, oldest first. */
export interface ChallengeResult {
  /** ⚠ Open string, deliberately — see the file header. */
  readonly challengeName: string;
  /** `false` for a failed attempt. ⚠ Failures are APPENDED, not replaced — that is what makes counting possible. */
  readonly challengeResult: boolean;
  /**
   * ⚠ THE ONLY CHANNEL that survives from one `CreateAuthChallenge` invocation to the next.
   * Meaningful only when `challengeName === "CUSTOM_CHALLENGE"`.
   * We carry `"v1:<issuedAt>:<hmac>"` here — never the code itself. See `codec.ts`.
   */
  readonly challengeMetadata?: string;
}

interface BaseTriggerEvent {
  readonly version: string;
  readonly region: string;
  /** ⚠ This is what lets ONE deployment serve four pools (research R8). */
  readonly userPoolId: string;
  readonly triggerSource: string;
  readonly userName: string;
  /**
   * ⚠ EXACTLY TWO FIELDS, AND NEITHER IS AN IP ADDRESS.
   * This is why FR-013 (per-source rate limiting) is an AWS WAF rule on the user pool and not
   * something this code can do. Do not go looking for a caller IP — it is not here, and
   * `clientMetadata` is client-controlled and therefore worthless for rate limiting.
   */
  readonly callerContext: { readonly awsSdkVersion: string; readonly clientId: string };
}

export interface DefineAuthChallengeEvent extends BaseTriggerEvent {
  readonly request: {
    readonly userAttributes: Record<string, string>;
    readonly session: readonly ChallengeResult[];
    /** Populated only when the app client has `PreventUserExistenceErrors = ENABLED`. */
    readonly userNotFound?: boolean;
  };
  response: {
    challengeName?: string;
    issueTokens: boolean;
    failAuthentication: boolean;
  };
}

export interface CreateAuthChallengeEvent extends BaseTriggerEvent {
  readonly request: {
    readonly userAttributes: Record<string, string>;
    readonly challengeName: string;
    readonly session: readonly ChallengeResult[];
    readonly userNotFound?: boolean;
    /** ⚠ ABSENT on the InitiateAuth-driven invocation — the one that actually sends the email. */
    readonly clientMetadata?: Record<string, string>;
  };
  response: {
    /** ⚠ CLIENT-VISIBLE (surfaces as the API's `ChallengeParameters`). Masked destination ONLY. */
    publicChallengeParameters: Record<string, string>;
    /** Server-side only; handed to the verify trigger. ⚠ Does NOT persist across attempts. */
    privateChallengeParameters: Record<string, string>;
    /** Survives into the next invocation via `session[]`. */
    challengeMetadata: string;
  };
}

export interface VerifyAuthChallengeEvent extends BaseTriggerEvent {
  readonly request: {
    readonly userAttributes: Record<string, string>;
    /** From the IMMEDIATELY preceding `CreateAuthChallenge`. */
    readonly privateChallengeParameters: Record<string, string>;
    readonly challengeAnswer: string;
    readonly userNotFound?: boolean;
    readonly clientMetadata?: Record<string, string>;
  };
  response: { answerCorrect: boolean };
}

export interface PostAuthenticationEvent extends BaseTriggerEvent {
  readonly request: {
    readonly userAttributes: Record<string, string>;
    readonly newDeviceUsed?: boolean;
    readonly clientMetadata?: Record<string, string>;
  };
  response: Record<string, never>;
}

/** The one challenge name this platform authors. Everything else is somebody else's state. */
export const CUSTOM_CHALLENGE = "CUSTOM_CHALLENGE";
