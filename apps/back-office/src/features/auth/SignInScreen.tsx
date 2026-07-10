import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";

import { OtpSignInCard } from "@effy/web-kit/console";

import { track } from "@/lib/telemetry";

import { sessionQuery } from "./queries";

// The passwordless card (two-step email → code, uniform error copy, no password field) is shared;
// navigation and this surface's analytics taxonomy are not.
export function SignInScreen({ next }: { next?: string }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  async function finish() {
    await queryClient.invalidateQueries({ queryKey: sessionQuery.queryKey });
    // US1 has a single protected route; multi-route `next`-return arrives with US2+.
    void next;
    navigate({ to: "/" });
  }

  return (
    <OtpSignInCard
      title="Effy Back-Office"
      onAuthenticated={finish}
      onSignInStarted={() => track({ name: "auth_sign_in_started" })}
      onOtpSubmitted={() => track({ name: "auth_otp_submitted" })}
      onSignInFailed={(reason) => track({ name: "auth_sign_in_failed", reason })}
    />
  );
}
