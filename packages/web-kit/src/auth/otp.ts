import { confirmSignIn, fetchAuthSession, signIn, signOut } from "aws-amplify/auth";

/**
 * The passwordless email-code flow — identical for every Effy pool (constitution Principle IV: the
 * internal audiences are strictly passwordless; no password field exists on these surfaces).
 *
 *   email → startSignIn → CONFIRM_SIGN_IN_WITH_CUSTOM_CHALLENGE → submitOtp → DONE
 *
 * ⚠ 035 CHANGED THE FLOW, NOT THE EXPERIENCE. This used to ask Cognito for `USER_AUTH` with
 * `preferredChallenge: "EMAIL_OTP"` — the managed passwordless factor, which emits an EIGHT-digit
 * code whose length is not configurable by any setting on any object. The platform now issues its
 * own SIX-digit code from a custom challenge, so every code on every surface is the same length.
 * See specs/035-six-digit-otp/.
 *
 * ⚠ `CUSTOM_WITHOUT_SRP`, NEVER `CUSTOM_WITH_SRP`. The WITH_SRP variant has a recorded history of
 * returning `DONE` from the first `signIn` — issuing tokens WITHOUT presenting the challenge
 * (amplify-android #2331/#2566, fixed twice and reported recurring). There is no password on these
 * pools for SRP to verify anyway.
 */

export type SignInOutcome = "otp-required" | "done";

export async function startSignIn(email: string): Promise<SignInOutcome> {
  const { nextStep } = await signIn({
    username: email,
    options: { authFlowType: "CUSTOM_WITHOUT_SRP" },
  });
  switch (nextStep.signInStep) {
    // The platform's own 6-digit code (035).
    case "CONFIRM_SIGN_IN_WITH_CUSTOM_CHALLENGE":
      return "otp-required";
    // ⚠ Kept deliberately during rollout. Both flows coexist on the pool so a surface can be
    // reverted to the managed factor by changing the constant above and nothing else (FR-033) —
    // and a session begun under the old flow before a deploy still completes rather than dying
    // in the `default` below (FR-034).
    case "CONFIRM_SIGN_IN_WITH_EMAIL_CODE":
      return "otp-required";
    case "DONE":
      // ⚠ Reaching DONE straight from `signIn` means no challenge was presented. On a passwordless
      // pool that should be impossible; it is also the exact shape of the amplify-android defect
      // named above. Treated as success because Amplify has already issued tokens by this point —
      // but see `AuthStepMappingTest` on mobile, which asserts it never happens.
      return "done";
    default:
      throw new Error(`Unexpected sign-in step: ${nextStep.signInStep}`);
  }
}

export async function submitOtp(code: string): Promise<void> {
  const { nextStep } = await confirmSignIn({ challengeResponse: code });
  if (nextStep.signInStep !== "DONE") {
    throw new Error(`Unexpected confirmation step: ${nextStep.signInStep}`);
  }
}

export async function signOutUser(): Promise<void> {
  await signOut();
}

/** True once Amplify holds an access token — the raw signal `loadSession` builds on. */
export async function hasSession(): Promise<boolean> {
  try {
    const { tokens } = await fetchAuthSession();
    return Boolean(tokens?.accessToken);
  } catch {
    return false;
  }
}

/**
 * Cognito exception name → human copy.
 *
 * Deliberately says nothing about whether the account exists: an unprovisioned email must produce
 * the same experience as a provisioned one, or the sign-in form becomes an account-existence
 * oracle (spec edge case, and 035 FR-028).
 *
 * ⚠ 035 adds `NotAuthorizedException`. Under a custom challenge, running out of attempts surfaces
 * as `failAuthentication: true` from the define trigger, which the SDK reports as
 * NotAuthorizedException — the SAME exception an unknown address produces. That collision is the
 * point: the shopper is told to start again, and nothing distinguishes "you used your three tries"
 * from "no such account".
 */
export function otpErrorMessage(err: unknown): string {
  const name = err instanceof Error ? err.name : "";
  switch (name) {
    case "CodeMismatchException":
      return "That code isn't right. Please try again.";
    case "ExpiredCodeException":
      return "That code expired. Request a new one.";
    case "LimitExceededException":
    case "TooManyRequestsException":
    case "TooManyFailedAttemptsException":
      return "Too many attempts. Please wait a moment and try again.";
    case "NotAuthorizedException":
      return "That didn't work. Request a new code and try again.";
    default:
      return "We couldn't verify that code. Please try again.";
  }
}

/** The uniform failure for the email step — never reveals whether the account exists. */
export const START_SIGN_IN_ERROR = "We couldn't send a code. Check the email address and try again.";
