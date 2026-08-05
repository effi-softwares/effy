"use client"

import * as React from "react"

/**
 * Browser-back support for a step form that lives on ONE route (036 FR-022, R1).
 *
 * ⚠ WHY THE STEPS ARE NOT SEPARATE URLs. Three independent facts rule it out:
 *
 *  1. **Amplify's in-flight challenge state is per-tab and time-boxed.** `@aws-amplify/auth` keeps
 *     `username` / `challengeName` / `signInSession` in `window.sessionStorage` under
 *     `CognitoSignInState.*` with a THREE-MINUTE expiry — shorter than the five-minute code TTL — and
 *     `sessionStorage` does not exist in a new tab. A `/sign-in/code` URL would be a dead form on a
 *     reload past three minutes, and a dead form always in a new tab.
 *  2. **`autoSignIn` state is memory-only.** It has no persistence at all, so a hard reload between
 *     sign-up and confirm turns `COMPLETE_AUTO_SIGN_IN` into a plain `DONE` — the customer is
 *     confirmed but signed OUT, with no error to explain it.
 *  3. **Splitting the email from the password across URLs is what BREAKS password managers.** Keeping
 *     both inputs mounted in one `<form>` is the configuration Chrome and Safari want for fill and,
 *     especially, for save.
 *
 * ⚠ WHY `history.pushState` AND NOT `router.push`. Whether a Next.js client component remounts on a
 * searchParam-only change is an implementation detail of the router, and a remount would wipe the
 * step state this hook exists to preserve. `pushState` touches the history stack and nothing else, so
 * React state stays the single source of truth.
 */
export function useStepHistory<S extends string>(
  initial: S,
  options: {
    /**
     * ⚠ RE-ENTRANCY GUARD. Answers "could the flow legitimately be at this step right now?"
     *
     * A `popstate` can land on a step whose underlying session is spent — the shopper went forward to
     * the code step, waited four minutes, and pressed back then forward. Without this, they would sit
     * on a code form that no longer has a challenge behind it, typing into nothing. Returning `false`
     * sends them to the first step, which is always safe and always actionable.
     */
    canEnter?: (step: S) => boolean
  } = {},
) {
  const [step, setStep] = React.useState<S>(initial)
  // Read through a ref so `popstate` always sees the CURRENT predicate rather than the one captured
  // when the listener was attached — otherwise the guard silently checks a stale flow state.
  const canEnterRef = React.useRef(options.canEnter)
  canEnterRef.current = options.canEnter

  React.useEffect(() => {
    function onPopState(event: PopStateEvent) {
      const target = (event.state as { effyAuthStep?: S } | null)?.effyAuthStep
      // No marker means the entry from before this flow began — that is the first step.
      if (!target) {
        setStep(initial)
        return
      }
      const allowed = canEnterRef.current?.(target) ?? true
      setStep(allowed ? target : initial)
    }
    window.addEventListener("popstate", onPopState)
    return () => window.removeEventListener("popstate", onPopState)
  }, [initial])

  /** Advance to a step, leaving a history entry so the browser's back button returns here. */
  const go = React.useCallback((next: S) => {
    setStep(next)
    window.history.pushState({ effyAuthStep: next }, "", window.location.href)
  }, [])

  /**
   * Move back one step.
   *
   * ⚠ This delegates to `history.back()` rather than calling `setStep` directly, so the in-flow "Back"
   * control and the browser's own button take the SAME path. Two code paths for one concept is how
   * they end up disagreeing — one preserving the typed email and the other not.
   */
  const back = React.useCallback(() => {
    window.history.back()
  }, [])

  return { step, go, back, setStep }
}
