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
      <div className="grid gap-1.5">
        {/* The design's small brand-coloured eyebrow above the heading. It is the form column's only
            use of the action colour, which is what ties it to the panel beside it. */}
        <p className="text-[11.5px] font-semibold uppercase tracking-[.06em] text-brand">
          Shop console
        </p>
        <h1 className="text-2xl font-semibold tracking-[-.02em]">Sign in</h1>
        <p className="text-sm text-muted-foreground">
          Enter your work email below to access your shop.
        </p>
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

      <p className="text-muted-foreground text-xs">
        Effy staff only. Access is granted by your shop manager.
      </p>
    </div>
  );
}
