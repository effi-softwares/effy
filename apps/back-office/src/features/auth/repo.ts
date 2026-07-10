import { toBackOfficeRoles } from "@effy/shared-types";
import { fetchAuthSession } from "aws-amplify/auth";

import type { Session } from "./model";

// The EMAIL_OTP flow itself is identical on every pool, so it lives in the kit. What is
// surface-specific is the SHAPE of a session — which role union it narrows the claim to.
export { signOutUser, startSignIn, submitOtp, type SignInOutcome } from "@effy/web-kit";

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
