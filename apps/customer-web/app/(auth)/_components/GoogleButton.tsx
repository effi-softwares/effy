"use client"

import * as React from "react"

/**
 * The "Continue with Google" control (036 FR-038, FR-039, FR-040).
 *
 * ⚠ THE MARK MAY NEVER BE RECOLOURED, AND THAT IS GOOGLE'S RULE, NOT A PREFERENCE.
 * Google's branding guidelines: "Regardless of the text, you can't change the size or color of the
 * Google 'G' logo. It must be the standard color version… and appear on a white background."
 * Monochrome versions of the 'G' are explicitly prohibited. The BUTTON may take a light, neutral or
 * dark theme; the MARK never changes.
 *
 * ⚠ This is the constitution's own named exception to the monochrome rule (Principle V): "The single
 * exception is a third-party sign-in mark whose provider's brand guidelines require its own colours;
 * that is an asset, not a token." So: no token is added, `tokens:check` stays untouched, and these
 * four hex values live here as an asset rather than anywhere near `tokens.css`.
 *
 * ⚠ NOTE FOR A FUTURE SWEEP: Google blue is visually close to the retired shop-splash blue that
 * `scripts/check-no-emerald.sh` bans. They are DIFFERENT values, and the mark below is not a
 * violation — do not "fix" it to match. (The banned value is deliberately not written out here: the
 * guard scans comments too, so quoting it would fail the build. It is listed in that script.)
 *
 * ⚠ The icon may not be used alone — Google requires accompanying text stating the action, which is
 * also why the mark is `aria-hidden` and the button takes its accessible name from the label.
 *
 * ⚠ WHY THIS LIVES IN THE APP AND NOT IN `@effy/design-system/ui`. The `ui` barrel is imported by
 * guest routes, and `/search` and `/cart` sit 2.0 KB under a 174 KB gate. An asset used on exactly
 * two screens inside `app/(auth)/` — which is not measured by the budget — costs those routes nothing
 * here, and cannot be pulled onto them by a future barrel re-export.
 */
export function GoogleButton({
  label,
  testId,
  disabled,
  onUnavailable,
}: {
  label: string
  testId: string
  disabled?: boolean
  onUnavailable: (message: string) => void
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      disabled={disabled}
      onClick={() => onUnavailable(GOOGLE_UNAVAILABLE)}
      className="flex h-11 w-full items-center justify-center gap-3 rounded-full border text-sm font-medium hover:bg-accent disabled:opacity-60"
    >
      <GoogleMark />
      {label}
    </button>
  )
}

/**
 * ⚠ THE HONEST REFUSAL (FR-039).
 *
 * Google is BUILT but PARKED: `customer_google_enabled` is false, so no Cognito hosted domain exists
 * and there is no address to redirect the browser to. Calling `signInWithRedirect` would throw and
 * land in `authErrorMessage`'s default — "Something went wrong. Please try again." — which is a lie.
 * Nothing went wrong. The capability is not built yet, and the shopper has a route that works.
 *
 * ⚠ Un-parking must not move or reword the control (FR-040) — only replace this handler.
 */
export const GOOGLE_UNAVAILABLE =
  "Google sign-in isn't available yet. For now, use your email — we'll send you a code."

/**
 * Google's standard four-colour 'G', from the official sign-in asset pack.
 *
 * ⚠ Four solid-fill paths, no gradient — the "gradient super G" is four flat colour segments. That is
 * also what makes the Android VectorDrawable twin at
 * `packages/design-system/mobile-assets/drawable/ic_google_g.xml` a faithful copy rather than an
 * approximation.
 */
function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden focusable="false">
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  )
}
