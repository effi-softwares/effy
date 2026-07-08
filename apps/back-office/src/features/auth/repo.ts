import { toBackOfficeRoles } from "@effy/shared-types";
import { confirmSignIn, fetchAuthSession, signIn, signOut } from "aws-amplify/auth";

import type { Session } from "./model";

// Build the platform-agnostic Session from the Amplify session. Subject + roles come from the
// ACCESS token; email (for the greeting) from the ID token. Never throws to the caller for a
// missing session — a signed-out state is a normal value.
export async function loadSession(): Promise<Session> {
  const { tokens } = await fetchAuthSession();
  const access = tokens?.accessToken;
  if (!access) return { status: "signed-out" };

  const subject = typeof access.payload.sub === "string" ? access.payload.sub : "";
  const groupsClaim = access.payload["cognito:groups"];
  const roles = toBackOfficeRoles(
    Array.isArray(groupsClaim) ? groupsClaim.map(String) : undefined,
  );
  const emailClaim = tokens?.idToken?.payload.email;
  const email = typeof emailClaim === "string" ? emailClaim : "";

  return { status: "signed-in", identity: { subject, email, roles } };
}

export type SignInOutcome = "otp-required" | "done";

// Passwordless EMAIL_OTP via the USER_AUTH choice flow (research C2). No password anywhere.
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
