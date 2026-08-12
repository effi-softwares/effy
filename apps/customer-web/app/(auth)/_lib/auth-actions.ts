"use client"

import {
  autoSignIn,
  confirmSignIn,
  confirmSignUp,
  resetPassword,
  confirmResetPassword,
  resendSignUpCode,
  signIn,
  signInWithRedirect,
  signUp,
} from "aws-amplify/auth"
import { PASSWORD_MIN_LENGTH, type CredentialRoute } from "@effy/shared-types"

/**
 * The three credential routes, in one place (contracts/auth-flows.contract.md).
 *
 * All three converge on ONE Cognito profile → one `sub` → one `public.customer` row. That
 * convergence is not achieved here — it is achieved by the pre-sign-up linking trigger on the
 * backend. This module only drives the flows.
 */

// ── Route (a): email + password ────────────────────────────────────────────────────────────────

/**
 * ⚠ `autoSignIn` is not a nicety — it is FR-009b.
 *
 * Without it, Cognito confirms the account and leaves the customer at a sign-in form, being asked to
 * type the password they chose ninety seconds ago. That is a self-inflicted drop-off at the exact
 * moment the customer has finally committed, and it was a defect against the spec's own acceptance
 * scenario ("an account is created, AND THEY ARE SIGNED IN").
 */
/**
 * ⚠ 036 FR-032 — NO NAME IS SENT HERE ANY MORE, and 011's FR-009a is superseded.
 *
 * `given_name`/`family_name` used to ride along on this call, because they were collected on the very
 * first screen — above the email field, before the stranger had any reason to trust the form. The
 * name is now the LAST step of registration, written by `PATCH /customer/v1/me` once the account
 * exists and the customer is signed in.
 *
 * ✅ Safe, and it needed no infrastructure change: there is no `schema {}` block on the customer pool,
 * so Cognito's default schema applies and both attributes are OPTIONAL at `SignUp`. The record's
 * columns have been nullable since 019, deliberately, for the federated route — "the platform must
 * not invent a name it was never given". Registration simply creates the row with NULLs, which every
 * surface already renders gracefully.
 */
export async function signUpWithPassword(email: string, password: string) {
  return signUp({
    username: email,
    password,
    options: {
      userAttributes: { email },
      autoSignIn: true,
    },
  })
}

export async function signInWithPassword(email: string, password: string) {
  return signIn({
    username: email,
    password,
    // SRP: the password is never transmitted. `USER_PASSWORD_AUTH` would send it in plaintext over
    // TLS and exists for migration triggers — we do not enable it on the app client at all.
    options: { authFlowType: "USER_SRP_AUTH" },
  })
}

// ── Route (b): email OTP, with NO password ever set ────────────────────────────────────────────

/**
 * ⚠ Note what is NOT here: a randomly-generated password.
 *
 * Everyone's first instinct with "passwordless sign-up" on Cognito is to invent a throwaway
 * password behind the customer's back, because `SignUp` looks like it requires one. It does not:
 * the API marks `Password` as optional, and omitting it creates a genuinely passwordless user —
 * provided the pool supports passwordless sign-in AND the request comes from our own SDK-driven
 * form (Cognito's HOSTED sign-up page always requires a password; ours does not).
 *
 * The random-password hack would leave every OTP customer holding a credential they do not know,
 * cannot rotate, and never asked for.
 *
 * ⚠ 035 makes that reasoning LOAD-BEARING in a second way. The throwaway-password shortcut would
 * also break 012's set-first-password flow, which calls `ChangePassword` WITHOUT `PreviousPassword`
 * — a call that only works on an account that genuinely has no password — and would desynchronise
 * the platform's own `has_password` column. It is not just distasteful; it silently breaks a
 * shipped security control.
 *
 * ⚠ 035 KEEPS `autoSignIn`, and the reasoning is worth stating because the obvious move is wrong.
 *
 * Amplify documents exactly one `authFlowType` for `autoSignIn` — `USER_AUTH` — and this platform
 * now SIGNS IN with `CUSTOM_WITHOUT_SRP`, so the first instinct is to drop `autoSignIn` and call
 * `signIn` explicitly after registration. That would be a REGRESSION, not a fix: the code the
 * customer types here is the `ConfirmSignUp` code, which is already six digits and which 035 does
 * not touch (FR-003). Removing `autoSignIn` would leave them confirmed but signed out, needing a
 * SECOND code to get in — two codes where there is currently one.
 *
 * `autoSignIn` issues no code of its own, so FR-001 ("every code the platform ISSUES is six
 * digits") is not engaged. It needs `ALLOW_USER_AUTH`, which the customer client retains anyway
 * because passwordless `SignUp` is only legal while it is present (research R4b).
 *
 * ⚠ UNVERIFIED, AND ON THE SPIKE LIST. What `autoSignIn` does once custom-auth triggers are
 * attached to this pool is not documented anywhere I could find: it may complete from the
 * confirmation alone (today's behaviour, one code) or it may initiate a fresh challenge (two
 * codes, and possibly an eight-digit one). T003 must check this on the dev pool before the
 * customer audience migrates — see specs/035-six-digit-otp/research.md § R4b.
 */
export async function signUpWithOtp(email: string) {
  return signUp({
    username: email,
    options: {
      // ⚠ 036 FR-032 — no name here either. See `signUpWithPassword` above.
      userAttributes: { email },
      // ⚠ RETAINED by 035 — see the note above. Removing this would cost the customer a second
      // code, and it issues none of its own.
      autoSignIn: { authFlowType: "USER_AUTH" },
    },
  })
}

export async function confirmSignUpCode(email: string, code: string) {
  return confirmSignUp({ username: email, confirmationCode: code })
}

export async function completeAutoSignIn() {
  return autoSignIn()
}

/**
 * ⚠ 035 — the platform's own SIX-digit code, not Cognito's managed eight-digit EMAIL_OTP.
 *
 * The managed factor's length is not configurable by any setting on any object — not on the pool,
 * the app client, the sign-in policy, `EmailMfaConfigType`, or the message templates — so a custom
 * challenge is the only route to one code length across the platform.
 *
 * ⚠ `CUSTOM_WITHOUT_SRP`, never `CUSTOM_WITH_SRP`: the WITH_SRP variant has a recorded history of
 * completing sign-in WITHOUT presenting the challenge.
 */
export async function signInWithOtp(email: string) {
  return signIn({
    username: email,
    options: { authFlowType: "CUSTOM_WITHOUT_SRP" },
  })
}

/**
 * The sign-in steps this surface accepts (035 T070).
 *
 * ⚠ customer-web had NO switch on `signInStep` at all — `signInWithOtp` returned the raw result and
 * every caller assumed a code was coming. That made it the surface where a new or unexpected step
 * fails LATEST and most confusingly: no throw, no branch, just a code screen for a code that was
 * never sent. The console surfaces at least threw.
 */
export type OtpSignInStep = "otp-required" | "done"

export function classifySignInStep(step: string): OtpSignInStep {
  switch (step) {
    // The platform's own 6-digit code.
    case "CONFIRM_SIGN_IN_WITH_CUSTOM_CHALLENGE":
      return "otp-required"
    // ⚠ Kept during rollout: both flows coexist on the pool, so a revert is a one-constant change
    // (FR-033) and a session begun under the managed factor still completes (FR-034).
    case "CONFIRM_SIGN_IN_WITH_EMAIL_CODE":
      return "otp-required"
    case "DONE":
      return "done"
    default:
      throw new Error(`Unexpected sign-in step: ${step}`)
  }
}

/**
 * Submit the emailed code.
 *
 * ⚠ In the factor-SELECTION path (when `preferredChallenge` is omitted), Cognito wants
 * `confirmSignIn` TWICE: once to choose the factor, once to submit the code. We always state a
 * preferred challenge, so this is the single call — but if you ever add a "how would you like to
 * sign in?" screen, that second call is where people get stuck.
 */
export async function submitOtpCode(code: string) {
  return confirmSignIn({ challengeResponse: code })
}

// ── Sending another code (036 FR-007, R4) ──────────────────────────────────────────────────────

/**
 * ⚠ THERE IS NO "RESEND" API FOR THE SIGN-IN CODE, AND THIS FUNCTION IS NAMED FOR WHAT IT ACTUALLY
 * DOES. It re-runs `signIn` from scratch.
 *
 * `CreateAuthChallenge` REUSES the existing envelope on a re-challenge and sends no email at all
 * (`create-auth-challenge.ts` — "Retry path: reuse, never regenerate"). A new email is produced only
 * by an invocation with an empty session, i.e. a brand-new `InitiateAuth`. So a "resend" is a fresh
 * sign-in, and it carries three consequences the UI owns:
 *
 *   • the 3-attempt counter RESETS — the new Cognito session starts with an empty attempt list;
 *   • the previous code becomes unreachable FROM THIS DEVICE, because `signIn` overwrites the stored
 *     session. ⚠ It is NOT revoked server-side; a holder of the old `Session` string could still
 *     redeem it for the remainder of its TTL. "Supersession" is a client-side property here;
 *   • it consumes ONE of five hourly sends for this address.
 *
 * ⚠ That last one is why `otp-cooldown.ts` and the caller's per-flow send counter are load-bearing
 * rather than polite. The SIXTH send in a clock hour is refused by the trigger, which then returns a
 * NORMAL-LOOKING challenge with a masked destination — so the shopper is shown "we emailed a code to
 * a•••@…" for an email that does not exist, and finds out only after burning three guesses.
 */
export async function resendSignInCode(email: string) {
  return signInWithOtp(email)
}

/**
 * Send the sign-UP confirmation code again.
 *
 * ⚠ This is a genuinely different mechanism from `resendSignInCode`: it is Cognito's MANAGED flow, so
 * a real resend API exists, refusals here are distinguishable (`CodeMismatchException` vs
 * `ExpiredCodeException` vs `LimitExceededException`), and it does NOT touch the platform's own
 * five-per-hour custom-challenge budget — Cognito's separate per-user limit applies instead.
 *
 * ⚠ Before 036 this API was called NOWHERE in the repository. No surface on the platform could resend
 * a sign-up code; the only recovery was to abandon the flow and start again.
 */
export async function resendSignUpCodeFor(email: string) {
  return resendSignUpCode({ username: email })
}

// ── Route (c): Google ──────────────────────────────────────────────────────────────────────────

/**
 * ⚠ This REDIRECTS the browser. There is no pure-SDK federation path — Cognito federation is an
 * OAuth round trip through the hosted domain (research D15), so the flow leaves our origin and
 * comes back to /callback.
 *
 * Because we leave the origin, the `next` destination cannot ride along in our own state: Cognito's
 * `redirectSignIn` is a fixed allowlist. So we stash it first and pick it up on the callback page.
 */
export async function startGoogleSignIn(next: string) {
  if (typeof window !== "undefined") {
    window.sessionStorage.setItem(PENDING_NEXT, next)
  }
  return signInWithRedirect({ provider: "Google" })
}

const PENDING_NEXT = "effy_pending_next"

export function takePendingNext(): string | null {
  if (typeof window === "undefined") return null
  const v = window.sessionStorage.getItem(PENDING_NEXT)
  window.sessionStorage.removeItem(PENDING_NEXT)
  return v
}

// ── Recovery (FR-014) ──────────────────────────────────────────────────────────────────────────

export async function startPasswordReset(email: string) {
  return resetPassword({ username: email })
}

/**
 * ⚠ `finishPasswordReset` IS NOT HERE ANY MORE. It moved to `_lib/recovery-actions.ts` (012 FR-022b).
 *
 * It used to call Amplify's `confirmResetPassword` directly from the browser, which was two bugs at
 * once: it BYPASSED the breach screening (a rule enforced on the account page but not on the recovery
 * page is a detour sign, not a rule), and it left the platform's `has_password` record permanently
 * WRONG — because the platform never found out that a password now existed.
 *
 * It is now a SERVER ACTION against a public backend route — and it must stay one because of those
 * two defects, not because of where the address lives. (The address is now
 * `NEXT_PUBLIC_EDGE_API_BASE_URL`; lib/config.ts records why. A client-side fetch would no longer
 * fail outright, which is exactly why the rule is written down here instead of being assumed.)
 */

// ── Errors the customer can act on (FR-015) ────────────────────────────────────────────────────

/**
 * Cognito's error names are precise but useless to a shopper ("NotAuthorizedException"). Every one
 * of them is turned into something the customer can DO something about — never a dead end, and
 * never a raw exception surfaced to a member of the public.
 */
export function authErrorMessage(err: unknown, context: "password" | "code" = "password"): string {
  const name = (err as { name?: string })?.name ?? ""

  switch (name) {
    case "UsernameExistsException":
      return "An account already exists with that email. Try signing in instead."
    case "NotAuthorizedException":
      // ⚠ 035 — THE SAME EXCEPTION NOW MEANS TWO DIFFERENT THINGS, which is why `context` exists.
      //
      // On the password route it is a credential mismatch, as it always was. On the CODE route it
      // is what `failAuthentication: true` from the define trigger surfaces as — i.e. the shopper
      // used all three attempts. Telling someone on a PASSWORDLESS sign-in that their "email and
      // password don't match" is nonsense they cannot act on: there is no password to check.
      //
      // ⚠ The code-route wording is deliberately the SAME as an unknown address would produce.
      // Distinguishing "you ran out of tries" from "no such account" would re-open the existence
      // oracle the whole flow is built to close (FR-028).
      return context === "code"
        ? "That didn't work. Request a new code and try again."
        : "That email and password don't match. Check them and try again, or reset your password."
    case "UserNotFoundException":
      // Cognito is configured with prevent_user_existence_errors, so this should not surface —
      // but if it ever does, we do not confirm whether the account exists.
      return "That email and password don't match. Check them and try again."
    case "CodeMismatchException":
      return "That code isn't right. Check it and try again."
    case "ExpiredCodeException":
      // ⚠ 036 — "Send another one", not "Ask for a new one". The old wording instructed an action the
      // screen provided NO CONTROL FOR: there was no resend anywhere on the platform. There is now.
      return "That code has expired. Send another one."
    case "LimitExceededException":
    case "TooManyRequestsException":
    case "TooManyFailedAttemptsException":
      return "Too many attempts. Wait a few minutes and try again."
    case "InvalidPasswordException":
      // ⚠ 012 — this string used to promise "at least 8 characters with upper and lower case letters
      // and a number". The pool policy is now 12 characters and NO composition rules (current NIST
      // guidance: composition rules are actively harmful — they produce `Password1!`). The old text
      // became a LIE the moment the policy changed, so it changed in the same commit.
      //
      // The length lives in ONE place (`PASSWORD_MIN_LENGTH`), shared with the backend that enforces
      // it, so this message cannot drift from the real rule again.
      return `That password is too short. Use at least ${PASSWORD_MIN_LENGTH} characters — no special characters required.`
    case "UserLambdaValidationException":
      // The linking trigger refused — almost always an unverified email from the provider.
      return "We couldn't link that account. Make sure the email on your Google account is verified, then try again."
    case "InvalidParameterException":
      return "Something in that form wasn't quite right. Check it and try again."
    case "SignInException":
      // ⚠ 036 R1 — THE CLIENT GAVE UP BEFORE THE SERVER DID, and the shopper must not be told
      // "something went wrong" for it.
      //
      // Amplify keeps the in-flight challenge (username, challengeName, signInSession) in
      // `window.sessionStorage` under `CognitoSignInState.*` with a THREE-MINUTE expiry. The code
      // itself is valid for FIVE (`OTP_TTL_SECONDS = 300`). So there is a two-minute window where a
      // hard reload throws this locally while the code and the Cognito session are both still good —
      // and a new browser tab has no state at all, because sessionStorage is per-tab.
      //
      // This is a recoverable, explicable state, not a fault. The caller routes back to the email
      // step with the address intact.
      return "Your sign-in timed out. Send a new code to continue."
    case "ForbiddenException":
      // ⚠ 036 R10 — the AWS WAF rate rule on the user pools (100 requests / 5 min / IP) blocks the
      // request before it ever reaches Cognito, so the SDK surfaces a bare 403.
      //
      // Until now this fell through to the generic default on EVERY surface, so a person being
      // rate-limited by their own network was told the platform was broken. It is not; they are
      // early, and waiting works.
      return "Too many attempts from this network. Wait a few minutes and try again."
    default:
      return "Something went wrong. Please try again."
  }
}

/**
 * Is this the client-side challenge-state expiry rather than a refusal from Cognito? (036 R1)
 *
 * ⚠ The caller must treat this differently from every other failure: there is nothing wrong with the
 * code the shopper typed, and nothing wrong with the account. The step machine sends them back to the
 * email step — with the address still populated — where one tap gets a fresh code. Showing the
 * refusal in place would leave them retyping a code that can no longer be checked by anyone.
 */
export function isStaleSignInSession(err: unknown): boolean {
  return (err as { name?: string })?.name === "SignInException"
}

export const ROUTE_LABEL: Record<CredentialRoute, string> = {
  password: "password",
  otp: "email code",
  google: "Google",
}
