import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";

import { OtpSignInCard } from "@effy/web-kit/console";

import { track } from "@/lib/telemetry";

import { sessionQuery } from "./queries";

// The passwordless card (two-step email → code, uniform error copy, no password field anywhere) is
// shared; navigation and the store audience's analytics taxonomy are not.
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
