"use client"

import {
  autoSignIn,
  confirmSignIn,
  confirmSignUp,
  resetPassword,
  confirmResetPassword,
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
export async function signUpWithPassword(
  name: { given: string; family: string },
  email: string,
  password: string,
) {
  return signUp({
    username: email,
    password,
    options: {
      // `given_name` / `family_name` are STANDARD Cognito attributes, so they ride on the ID token
      // with no custom claim and the backend stores them on the first authenticated request
      // (FR-009a). Two fields, not one: a delivery label needs the parts, and a single free-text
      // name cannot be split back into them reliably.
      userAttributes: { email, given_name: name.given, family_name: name.family },
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
 * `autoSignIn` then chains registration → verification → session, so the customer types ONE code
 * rather than two.
 */
export async function signUpWithOtp(
  name: { given: string; family: string },
  email: string,
) {
  return signUp({
    username: email,
    options: {
      userAttributes: { email, given_name: name.given, family_name: name.family },
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

export async function signInWithOtp(email: string) {
  return signIn({
    username: email,
    options: { authFlowType: "USER_AUTH", preferredChallenge: "EMAIL_OTP" },
  })
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
 * It is now a SERVER ACTION against a public backend route. That is not incidental: `EDGE_API_BASE_URL`
 * deliberately has no `NEXT_PUBLIC_` prefix, so the browser does not know the backend's address and a
 * client-side fetch could not have worked at all.
 */

// ── Errors the customer can act on (FR-015) ────────────────────────────────────────────────────

/**
 * Cognito's error names are precise but useless to a shopper ("NotAuthorizedException"). Every one
 * of them is turned into something the customer can DO something about — never a dead end, and
 * never a raw exception surfaced to a member of the public.
 */
export function authErrorMessage(err: unknown): string {
  const name = (err as { name?: string })?.name ?? ""

  switch (name) {
    case "UsernameExistsException":
      return "An account already exists with that email. Try signing in instead."
    case "NotAuthorizedException":
      return "That email and password don't match. Check them and try again, or reset your password."
    case "UserNotFoundException":
      // Cognito is configured with prevent_user_existence_errors, so this should not surface —
      // but if it ever does, we do not confirm whether the account exists.
      return "That email and password don't match. Check them and try again."
    case "CodeMismatchException":
      return "That code isn't right. Check it and try again."
    case "ExpiredCodeException":
      return "That code has expired. Ask for a new one."
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
    default:
      return "Something went wrong. Please try again."
  }
}

export const ROUTE_LABEL: Record<CredentialRoute, string> = {
  password: "password",
  otp: "email code",
  google: "Google",
}
