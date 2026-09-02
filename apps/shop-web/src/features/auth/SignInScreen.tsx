import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";

import { OtpSignInCard } from "@effy/web-kit/console";

import { track } from "@/lib/telemetry";

import { sessionQuery } from "./queries";

// The passwordless card (two-step email → code, uniform error copy, no password field anywhere) is
// shared; navigation and the shop audience's analytics taxonomy are not.
/**
 * The shop console's sign-in (US4, T038).
 *
 * ⚠ THE IMPORTED MOCKUP'S SIGN-IN SCREEN WAS NOT ADOPTED WHOLE, AND THE PART LEFT OUT IS THE
 * IMPORTANT ONE. It draws an **email + password** form with a "Forgot?" link, and offers "Email me a
 * one-time code" as a secondary button underneath. Effy cannot honour any of that for this audience:
 *
 *   • The constitution is explicit — driver, shop and admin are "strictly passwordless email
 *     one-time code, admin-provisioned"; "there are no passwords on the platform's internal
 *     audiences". 014 made that structural in shop-mobile's `AuthDriver` interface rather than
 *     leaving it to discipline.
 *   • The shop Cognito pool has no password flow configured at all, so the field would collect a
 *     credential the pool would refuse — and "Forgot?" would link to a recovery flow that does not
 *     exist for an account that has nothing to recover.
 *
 * A password box that cannot work is worse than an absent one: the operator blames themselves. So the
 * LAYOUT is adopted (brand lockup, heading, single narrow column) and the CREDENTIAL is not. The
 * one-time code is the only path, and it is the primary one. `__tests__/no-password.test.tsx` fails if
 * a password field ever appears here.
 */
export function SignInScreen({ next }: { next?: string }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  async function finish() {
    // Refresh the session before navigating, so the protected route's guard sees the new tokens.
    await queryClient.invalidateQueries({ queryKey: sessionQuery.queryKey });
    const session = await queryClient.ensureQueryData(sessionQuery);
    if (session.status === "signed-in") {
      track({ name: "shop_auth_sign_in_succeeded", subject: session.identity.subject });
    }
    // Return the operator to where they were headed (FR-004 / SC-010), not to the dashboard.
    navigate({ to: next ?? "/" });
  }

  return (
    <OtpSignInCard
      title="Effy Shop"
      onAuthenticated={finish}
      onSignInStarted={() => track({ name: "shop_auth_sign_in_started" })}
      onOtpSubmitted={() => track({ name: "shop_auth_otp_submitted" })}
      onSignInFailed={(reason) => track({ name: "shop_auth_sign_in_failed", reason })}
    />
  );
}
