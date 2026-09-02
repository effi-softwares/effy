import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";

import { OtpSignInCard } from "@effy/web-kit/console";

import { track } from "@/lib/telemetry";

import { sessionQuery } from "./queries";

/**
 * The shop console's sign-in (US4, rebuilt to the imported design in 057).
 *
 * ⚠ THE MOCKUP'S SIGN-IN SCREEN WAS NOT ADOPTED WHOLE, AND THE PART LEFT OUT IS THE IMPORTANT ONE.
 * It draws an **email + password** form with a "Forgot?" link, and demotes "Email me a one-time code"
 * to a secondary button underneath. Effy cannot honour any of that for this audience:
 *
 *   • The constitution is explicit — driver, shop and admin are "strictly passwordless email one-time
 *     code, admin-provisioned"; "there are no passwords on the platform's internal audiences". 014
 *     made that structural in shop-mobile's `AuthDriver` interface rather than leaving it to
 *     discipline.
 *   • The shop Cognito pool has NO password flow configured, so the field would collect a credential
 *     the pool refuses — and "Forgot?" would link to a recovery flow that does not exist for an
 *     account with nothing to recover.
 *
 * A password box that cannot work is worse than an absent one: the operator blames themselves. So the
 * LAYOUT is adopted — the brand lockup above a single narrow column, a 24px semibold heading, a muted
 * one-line explanation — and the CREDENTIAL is not. The one-time code is the only path and it is the
 * primary one. `__tests__/no-password.test.tsx` reads this directory and fails if a password field,
 * a recovery link, or a password auth flow ever appears.
 */
export function SignInScreen({ next }: { next?: string }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  async function finish() {
    await queryClient.invalidateQueries({ queryKey: sessionQuery.queryKey });
    const session = await queryClient.ensureQueryData(sessionQuery);
    if (session.status === "signed-in") {
      track({ name: "shop_auth_sign_in_succeeded", subject: session.identity.subject });
    }
    navigate({ to: next ?? "/" });
  }

  return (
    <div className="grid gap-6">
      <div className="grid gap-1.5">
        <h1 className="text-2xl font-semibold tracking-[-.02em]">Sign in</h1>
        <p className="text-muted-foreground text-sm">
          Enter your work email below to access your shop.
        </p>
      </div>

      {/* ⚠ The shared card supplies the whole OTP flow — email step, six-digit step, refusals. It is
          `border-none p-0` here because the mockup's sign-in is a bare column on the page ground, not
          a card floating on it; the surrounding layout already provides the frame. */}
      <OtpSignInCard
        title="Effy Shop"
        chrome="bare"
        onAuthenticated={finish}
        onSignInStarted={() => track({ name: "shop_auth_sign_in_started" })}
        onOtpSubmitted={() => track({ name: "shop_auth_otp_submitted" })}
        onSignInFailed={(reason) => track({ name: "shop_auth_sign_in_failed", reason })}
      />

      <p className="text-muted-foreground text-xs">
        Effy staff only. Access is granted by your shop manager.
      </p>
    </div>
  );
}
