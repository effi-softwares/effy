"use client"

// ⚠ Without this import the redirect completes and NOTHING HAPPENS — Amplify never processes the
// OAuth response. It is one line, it has no visible export, and omitting it is the single most
// common way to lose an afternoon to Cognito federation.
import "aws-amplify/auth/enable-oauth-listener"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Hub } from "aws-amplify/utils"
import { CircleX } from "lucide-react"

import { btnClass } from "@/components/storefront/actions"
import { safeNextTarget } from "@/lib/next-target"
import { mergeCartAfterSignIn } from "@/lib/cart-actions"
import { mergeSavedAfterSignIn } from "@/lib/saved-merge"
import { capture } from "@/lib/telemetry"
import { startGoogleSignIn, takePendingNext } from "../_lib/auth-actions"
import { ensureCustomerRecord } from "../_lib/seed-actions"
import { HAND_OVER_FAILED, handOverSession } from "../_lib/session-handoff"
import { AltJourney, StepShell } from "../_components/AuthKit"

const RETRY_FLAG = "effy_google_retry"

/**
 * The Google OAuth return.
 *
 * ⚠⚠ THE `AliasExistsException` RETRY — read before deleting it. ⚠⚠
 *
 * Because the customer pool uses email as the username attribute, the email is a sign-in ALIAS and
 * must be unique. When the pre-sign-up trigger links a Google identity into an EXISTING native
 * profile with the same email, Cognito is widely reported to raise `AliasExistsException` and FAIL
 * THE CUSTOMER'S FIRST GOOGLE SIGN-IN — while nonetheless creating the link, so the SECOND attempt
 * succeeds. AWS documentation neither confirms nor refutes this (research D17); the evidence is
 * AWS re:Post threads and aws-amplify#11565.
 *
 * We do not know yet whether it applies to our configuration. THE OPERATOR SPIKE (quickstart step
 * 6, task T052) settles it. So this handler retries the redirect EXACTLY ONCE on failure, guarded
 * by a session flag so it can never loop.
 *
 * If the spike shows the bug does not occur here, delete this retry — a silent retry that masks a
 * real error is a liability. If it does occur, this is what stands between a customer and a
 * sign-in that simply does not work the first time.
 */
export function CallbackHandler() {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const handled = useRef(false)

  useEffect(() => {
    const stop = Hub.listen("auth", ({ payload }) => {
      if (handled.current) return

      if (payload.event === "signInWithRedirect") {
        handled.current = true
        sessionStorage.removeItem(RETRY_FLAG)
        void completeSignIn()
      }

      async function completeSignIn() {
        if (!(await handOverSession())) {
          setError(HAND_OVER_FAILED)
          return
        }
        capture({ name: "sign_in_completed", props: { route: "google" } })
        capture({ name: "account_linked", props: { provider: "google" } })
        // 027 FR-011 — the federated route needs the same merge as the native ones.
        void mergeCartAfterSignIn()
    // 033 FR-028: the saved list joins the account on the FEDERATED (Google) return — ⚠ omitting it here is how a
    // Google sign-in silently drops the guest's saved items while email sign-in keeps them.
    void mergeSavedAfterSignIn()

        // ⚠ 036 R5 — THE RECORD WAS NEVER SEEDED ON THIS PATH, AND NOTHING NOTICED.
        //
        // This handler merged the cart and the saved list and then navigated away. It never called
        // `GET /customer/v1/me`, which is the ONLY thing that creates `public.customer` — so a
        // federated shopper reached the storefront with no platform record at all. Harmless while
        // every read created it lazily; a guaranteed failure the moment anything WRITES first, which
        // is exactly what the name step does: `PATCH /customer/v1/me` answers a missing record with
        // `403 "this account cannot be used"` — the barred-customer wording.
        //
        // Latent today because Google is parked (`customer_google_enabled = false`). Fixed now,
        // because the day it un-parks is not the day to discover it.
        void ensureCustomerRecord()

        const next = safeNextTarget(takePendingNext())
        if (next !== "/") {
          capture({ name: "deferred_sign_in_resumed", props: { route: "google" } })
        }
        router.replace(next)
        router.refresh()
      }

      if (payload.event === "signInWithRedirect_failure") {
        handled.current = true

        const alreadyRetried = sessionStorage.getItem(RETRY_FLAG) === "1"
        if (!alreadyRetried) {
          // The one retry. See the warning above.
          sessionStorage.setItem(RETRY_FLAG, "1")
          const next = safeNextTarget(
            typeof window !== "undefined"
              ? sessionStorage.getItem("effy_pending_next")
              : null,
          )
          void startGoogleSignIn(next)
          return
        }

        sessionStorage.removeItem(RETRY_FLAG)
        setError(
          "Google sign-in was cancelled or something went wrong. Nothing has changed — try again or use your email.",
        )
      }
    })

    return () => stop()
  }, [router])

  // Reference: Google sign-in failed.
  if (error) {
    return (
      <StepShell
        icon={<CircleX aria-hidden="true" />}
        title="We couldn't sign you in with Google"
        subtitle={
          <span role="alert" data-testid="auth-error">
            {error}
          </span>
        }
        footer={
          <AltJourney lead="Don't have an account?" href="/sign-up">
            Join
          </AltJourney>
        }
      >
        <div className="space-y-3">
          <button
            type="button"
            data-testid="google-retry"
            onClick={() => void startGoogleSignIn(safeNextTarget(null))}
            className={btnClass("primary", "lg", "h-11 w-full")}
          >
            Try Google again
          </button>
          <Link href="/sign-in" className={btnClass("outline", "lg", "h-11 w-full")}>
            Sign in with email
          </Link>
        </div>
      </StepShell>
    )
  }

  return (
    <div className="space-y-3 text-center" aria-live="polite">
      <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-muted border-t-primary" />
      <p className="text-sm text-muted-foreground">Signing you in…</p>
    </div>
  )
}
