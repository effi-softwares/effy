"use client"

// Without this import the redirect completes and Amplify never processes the OAuth response.
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
 * The Google OAuth return. Linking a Google identity into an existing native profile is reported to fail
 * the first federated sign-in with `AliasExistsException` while still creating the link
 * (aws-amplify#11565), so this retries the redirect exactly once, guarded by a session flag. Remove the
 * retry if it proves unnecessary on this pool.
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
        // The federated route needs the same cart merge as the native ones.
        void mergeCartAfterSignIn()
        // And the saved list, as email sign-in does.
        void mergeSavedAfterSignIn()

        // Ensure the platform record (`GET /customer/v1/me`): the name step's PATCH answers 403 without one.
        void ensureCustomerRecord()

        const next = safeNextTarget(takePendingNext())
        if (next !== "/") {
          capture({ name: "deferred_sign_in_resumed", props: { route: "google" } })
        }
        router.replace(next)
      }

      if (payload.event === "signInWithRedirect_failure") {
        handled.current = true

        const alreadyRetried = sessionStorage.getItem(RETRY_FLAG) === "1"
        if (!alreadyRetried) {
          // The one retry (see above).
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
          "Google sign-in was cancelled or something went wrong. Nothing has changed - try again or use your email.",
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
