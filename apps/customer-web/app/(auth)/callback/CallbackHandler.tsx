"use client"

// ⚠ Without this import the redirect completes and NOTHING HAPPENS — Amplify never processes the
// OAuth response. It is one line, it has no visible export, and omitting it is the single most
// common way to lose an afternoon to Cognito federation.
import "aws-amplify/auth/enable-oauth-listener"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Hub } from "aws-amplify/utils"

import { safeNextTarget } from "@/lib/next-target"
import { capture } from "@/lib/telemetry"
import { startGoogleSignIn, takePendingNext } from "../_lib/auth-actions"

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
        capture({ name: "sign_in_completed", props: { route: "google" } })
        capture({ name: "account_linked", props: { provider: "google" } })

        const next = safeNextTarget(takePendingNext())
        if (next !== "/") {
          capture({ name: "deferred_sign_in_resumed", props: { route: "google" } })
        }
        router.replace(next)
        router.refresh()
        return
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
          "We couldn't finish signing you in with Google. Try again, or use your email instead.",
        )
      }
    })

    return () => stop()
  }, [router])

  if (error) {
    return (
      <div className="space-y-4 text-center">
        <h1 className="text-xl font-semibold">Sign-in didn&apos;t complete</h1>
        <p role="alert" data-testid="auth-error" className="text-sm text-muted-foreground">
          {error}
        </p>
        <a
          href="/sign-in"
          className="inline-flex h-11 items-center rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground"
        >
          Back to sign in
        </a>
      </div>
    )
  }

  return (
    <div className="space-y-3 text-center" aria-live="polite">
      <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-muted border-t-primary" />
      <p className="text-sm text-muted-foreground">Signing you in…</p>
    </div>
  )
}
