import { confirmSignIn, fetchAuthSession, signIn, signOut } from "aws-amplify/auth";

/**
 * The passwordless email-code flow, the same for every internal pool (no passwords exist there):
 *
 *  email → startSignIn → CONFIRM_SIGN_IN_WITH_CUSTOM_CHALLENGE → submitOtp → done
 *
 * The code is the platform's own six digits from a custom challenge. `CUSTOM_WITHOUT_SRP`, never
 * `CUSTOM_WITH_SRP`, which has returned `DONE` without presenting the challenge (amplify-android
 * #2331/#2566).
 */

export type SignInOutcome = "otp-required" | "done";

/**
 * Amplify's `signIn` throws `UserAlreadyAuthenticatedException` whenever tokens sit in browser storage,
 * even stale or revoked ones, which the sign-in screen cannot recover from. Someone on the form wants a
 * new session, so the leftover one is signed out locally and the attempt runs once more. Only that
 * exception triggers it.
 */
export function isUserAlreadyAuthenticated(err: unknown): boolean {
  return (err as { name?: string } | null)?.name === "UserAlreadyAuthenticatedException";
}

export async function withStaleSessionCleared<T>(attempt: () => Promise<T>): Promise<T> {
  try {
    return await attempt();
  } catch (err) {
    if (!isUserAlreadyAuthenticated(err)) throw err;
    await signOut();
    return attempt();
  }
}

export async function startSignIn(email: string): Promise<SignInOutcome> {
  const { nextStep } = await withStaleSessionCleared(() =>
    signIn({
      username: email,
      options: { authFlowType: "CUSTOM_WITHOUT_SRP" },
    }),
  );
  switch (nextStep.signInStep) {
    case "CONFIRM_SIGN_IN_WITH_CUSTOM_CHALLENGE":
      return "otp-required";
    case "DONE":
      // Done straight from `signIn` means no challenge was presented, which should be impossible on a
      // passwordless pool; tokens are already issued, so it is treated as success.
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

/** True once Amplify holds an access token. */
export async function hasSession(): Promise<boolean> {
  try {
    const { tokens } = await fetchAuthSession();
    return Boolean(tokens?.accessToken);
  } catch {
    return false;
  }
}

/**
 * Cognito exception name → human copy that never says whether the account exists. Running out of
 * attempts surfaces as `NotAuthorizedException`, the same as an unknown address, so both read "start
 * again".
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
    // Amplify keeps the challenge state for three minutes and the code lives for five; a code typed in
    // between is refused locally, so the card returns to the email step.
    case "SignInException":
      return "Your sign-in timed out. Send a new code to continue.";
    default:
      return "We couldn't verify that code. Please try again.";
  }
}

/** The client-side challenge-state expiry, not a refusal from Cognito? */
export function isStaleSignInSession(err: unknown): boolean {
  return (err as { name?: string } | null)?.name === "SignInException";
}

/** The uniform failure for the email step: never reveals whether the account exists. */
export const START_SIGN_IN_ERROR = "We couldn't send a code. Check the email address and try again.";
