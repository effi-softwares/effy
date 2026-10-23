"use client"

import * as React from "react"

/**
 * Browser-back support for a step form on one route. Steps are not separate URLs: Amplify's challenge
 * state is per-tab and lasts three minutes, `autoSignIn` state is memory-only, and password managers
 * need the email and password in one form. `history.pushState`, not `router.push`, so no remount wipes
 * the step state.
 */
export function useStepHistory<S extends string>(
  initial: S,
  options: {
    /** Whether the flow could legitimately be at this step now; `false` sends a stale back/forward to the first step. */
    canEnter?: (step: S) => boolean
  } = {},
) {
  const [step, setStep] = React.useState<S>(initial)
  // Through a ref, so `popstate` sees the current predicate.
  const canEnterRef = React.useRef(options.canEnter)
  canEnterRef.current = options.canEnter

  React.useEffect(() => {
    function onPopState(event: PopStateEvent) {
      const target = (event.state as { effyAuthStep?: S } | null)?.effyAuthStep
      // No marker: the entry from before this flow, i.e. the first step.
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

  /** Advances to a step, leaving a history entry for the back button. */
  const go = React.useCallback((next: S) => {
    setStep(next)
    window.history.pushState({ effyAuthStep: next }, "", window.location.href)
  }, [])

  /** Moves back one step via `history.back`, so the in-flow Back and the browser's take the same path. */
  const back = React.useCallback(() => {
    window.history.back()
  }, [])

  return { step, go, back, setStep }
}
