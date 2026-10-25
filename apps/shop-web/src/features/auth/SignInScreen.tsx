import { useQueryClient } from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"

import { OtpSignInCard } from "@effy/web-kit/console"

import { track } from "@/lib/telemetry"

import { sessionQuery } from "./queries"

export function SignInScreen({ next }: { next?: string }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  async function finish() {
    const session = await queryClient.fetchQuery({ ...sessionQuery, staleTime: 0 })
    if (session.status === "signed-in") {
      track({ name: "shop_auth_sign_in_succeeded", subject: session.identity.subject })
    }
    navigate({ to: next ?? "/" })
  }

  return (
    <div className="grid gap-6">
      <div className="grid gap-2">
        <h1 className="text-3xl leading-9 font-semibold tracking-[-.025em] max-md:text-2xl">Sign in to Effy Shop</h1>
        <p className="text-muted-foreground">
          We&apos;ll email you a 6-digit code to access your shop. There&apos;s no password.
        </p>
      </div>

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
  )
}
