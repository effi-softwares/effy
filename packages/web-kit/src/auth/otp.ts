import { confirmSignIn, fetchAuthSession, signIn, signOut } from "aws-amplify/auth";

/**
 * The passwordless EMAIL_OTP flow — identical for every Effy pool (constitution Principle IV:
 * all four pools are passwordless; no password field exists anywhere on the platform).
 *
 *   email → startSignIn → CONFIRM_SIGN_IN_WITH_EMAIL_CODE → submitOtp → DONE
 */

export type SignInOutcome = "otp-required" | "done";

export async function startSignIn(email: string): Promise<SignInOutcome> {
  const { nextStep } = await signIn({
    username: email,
    options: { authFlowType: "USER_AUTH", preferredChallenge: "EMAIL_OTP" },
  });
  switch (nextStep.signInStep) {
    case "CONFIRM_SIGN_IN_WITH_EMAIL_CODE":
      return "otp-required";
    case "DONE":
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
 * oracle (spec edge case).
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
    default:
      return "We couldn't verify that code. Please try again.";
  }
}

/** The uniform failure for the email step — never reveals whether the account exists. */
export const START_SIGN_IN_ERROR = "We couldn't send a code. Check the email address and try again.";
