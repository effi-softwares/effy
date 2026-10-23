/**
 * Trigger shapes declared locally: `@types/aws-lambda` has a stale closed union for `challengeName`,
 * which would reject a name AWS adds. `challengeName` is an open string.
 */

/** Oldest first. */
export interface ChallengeResult {
  readonly challengeName: string;
  /** `false` for a failed attempt; failures are appended, which is what makes counting possible. */
  readonly challengeResult: boolean;
  /** The only channel between CreateAuthChallenge invocations: `"v1:<issuedAt>:<hmac>"` (see `codec.ts`). */
  readonly challengeMetadata?: string;
}

interface BaseTriggerEvent {
  readonly version: string;
  readonly region: string;
  /** Lets one deployment serve four pools. */
  readonly userPoolId: string;
  readonly triggerSource: string;
  readonly userName: string;
  /** No IP address here: per-source rate limiting is a WAF rule on the pool. */
  readonly callerContext: { readonly awsSdkVersion: string; readonly clientId: string };
}

export interface DefineAuthChallengeEvent extends BaseTriggerEvent {
  readonly request: {
    readonly userAttributes: Record<string, string>;
    readonly session: readonly ChallengeResult[];
    /** Set only when the app client has `PreventUserExistenceErrors = ENABLED`. */
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
    /** Absent on the InitiateAuth-driven invocation, the one that sends the email. */
    readonly clientMetadata?: Record<string, string>;
  };
  response: {
    /** Client-visible (`ChallengeParameters`): the masked destination only. */
    publicChallengeParameters: Record<string, string>;
    /** Server-side only; does not persist across attempts. */
    privateChallengeParameters: Record<string, string>;
    /** Survives into the next invocation via `session[]`. */
    challengeMetadata: string;
  };
}

export interface VerifyAuthChallengeEvent extends BaseTriggerEvent {
  readonly request: {
    readonly userAttributes: Record<string, string>;
    /** From the immediately preceding `CreateAuthChallenge`. */
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

/** `CustomMessage`. `codeParameter` is the `{####}` placeholder Cognito substitutes after we return. */
export interface CustomMessageEvent extends BaseTriggerEvent {
  readonly request: {
    readonly userAttributes: Record<string, string>;
    readonly codeParameter: string;
    readonly usernameParameter?: string;
    readonly linkParameter?: string;
    readonly clientMetadata?: Record<string, string>;
  };
  response: {
    smsMessage?: string | null;
    emailMessage?: string | null;
    emailSubject?: string | null;
  };
}

export const CUSTOM_CHALLENGE = "CUSTOM_CHALLENGE";
