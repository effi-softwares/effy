import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";

import { OtpSignInCard } from "@effy/web-kit/console";

import { track } from "@/lib/telemetry";

import { sessionQuery } from "./queries";

/**
 * The shop console's sign-in: an emailed one-time code is the only path. The design's password field
 * and "Forgot?" link are left out: internal audiences have no passwords and the shop pool has no password
 * flow, so the field would collect a credential the pool refuses. `__tests__/no-password.test.tsx` fails
 * if a password field, a recovery link or a password auth flow appears.
 */
export function SignInScreen({ next }: { next?: string }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  async function finish() {
    // A forced fetch, not invalidate + ensureQueryData. Nothing on the sign-in page observes the
    // session, so `invalidateQueries` refetches nothing, and `ensureQueryData` returns whatever is
    // cached — the "signed-out" left by sign-out or by the guard that sent the operator here. The
    // guard then read that same stale entry and bounced a freshly-authenticated operator back to
    // sign-in, and the only way through was a second code.
    const session = await queryClient.fetchQuery({ ...sessionQuery, staleTime: 0 });
    if (session.status === "signed-in") {
      track({ name: "shop_auth_sign_in_succeeded", subject: session.identity.subject });
    }
    navigate({ to: next ?? "/" });
  }

  return (
    <div className="grid gap-6">
      <div className="grid gap-2">
        <h1 className="text-[30px] leading-9 font-semibold tracking-[-.025em] max-md:text-2xl">Sign in to Effy Shop</h1>
        <p className="text-muted-foreground">We&apos;ll email you a 6-digit code to access your shop. There&apos;s no password.</p>
      </div>

      {/* The shared card supplies the whole OTP flow — email step, six-digit step, refusals. It is
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

      <p className="text-sm text-muted-foreground">
        No account? Your manager or Effy adds you — there&apos;s no sign-up.
      </p>
    </div>
  );
}
