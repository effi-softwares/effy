"use client"

import {
  autoSignIn,
  confirmSignIn,
  confirmSignUp,
  resetPassword,
  resendSignUpCode,
  signIn,
  signInWithRedirect,
  signUp,
} from "aws-amplify/auth"
import { PASSWORD_MIN_LENGTH, type CredentialRoute } from "@effy/shared-types"

/** The three credential routes. They converge on one Cognito profile and one `public.customer` row through the backend's pre-sign-up linking trigger; this module only drives the flows. */

// Route (a): email + password

/**
 * `autoSignIn` signs the customer in once the account is confirmed, instead of asking for the password
 * they just chose. No name is sent: it is the last registration step, and Cognito's default schema makes
 * both name attributes optional.
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
    // SRP: the password is never transmitted (`USER_PASSWORD_AUTH` is not enabled on the client).
    options: { authFlowType: "USER_SRP_AUTH" },
  })
}

// Route (b): email code, with no password ever set

/**
 * No throwaway password: omitting `Password` creates a genuinely passwordless user, which the
 * set-first-password flow (`ChangePassword` without `PreviousPassword`) and the `has_password` record
 * depend on. `autoSignIn` (which needs `ALLOW_USER_AUTH`) signs the customer in from the six-digit
 * `ConfirmSignUp` code, so no second code is needed.
 */
export async function signUpWithOtp(email: string) {
  return signUp({
    username: email,
    options: {
      // No name here either (see `signUpWithPassword`).
      userAttributes: { email },
      // Kept: removing it would cost the customer a second code.
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
 * The platform's own six-digit code from a custom challenge (Cognito's managed email code is eight
 * digits and not configurable). `CUSTOM_WITHOUT_SRP`, never `CUSTOM_WITH_SRP`, which has completed
 * sign-in without the challenge.
 */
export async function signInWithOtp(email: string) {
  return signIn({
    username: email,
    options: { authFlowType: "CUSTOM_WITHOUT_SRP" },
  })
}

/** The sign-in steps this surface accepts; anything else throws rather than showing a code screen for a code never sent. */
export type OtpSignInStep = "otp-required" | "done"

export function classifySignInStep(step: string): OtpSignInStep {
  switch (step) {
    case "CONFIRM_SIGN_IN_WITH_CUSTOM_CHALLENGE":
      return "otp-required"
    case "DONE":
      return "done"
    default:
      throw new Error(`Unexpected sign-in step: ${step}`)
  }
}

/** Submits the emailed code. A preferred challenge is always stated, so this is one call (factor selection would need two). */
export async function submitOtpCode(code: string) {
  return confirmSignIn({ challengeResponse: code })
}

// Sending another code

/**
 * There is no resend API for the sign-in code: this re-runs `signIn` (`CreateAuthChallenge` reuses the
 * envelope on a re-challenge and sends nothing). So a resend resets the three-attempt counter, makes the
 * previous code unreachable from this device (not revoked server-side), and uses one of twenty hourly
 * sends; the 21st is refused but still looks like a normal challenge, hence the client-side counter.
 */
export async function resendSignInCode(email: string) {
  return signInWithOtp(email)
}

/**
 * Sends the sign-up confirmation code again: Cognito's managed flow, with a real resend API,
 * distinguishable refusals, and Cognito's own per-user limit (not the platform's hourly budget).
 */
export async function resendSignUpCodeFor(email: string) {
  return resendSignUpCode({ username: email })
}

// Route (c): Google

/**
 * Redirects through Cognito's hosted domain (federation is an OAuth round trip) and back to /callback.
 * `redirectSignIn` is a fixed allowlist, so `next` is stashed first and read on the callback page.
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

// Recovery

export async function startPasswordReset(email: string) {
  return resetPassword({ username: email })
}

/**
 * `finishPasswordReset` is a Server Action (`_lib/recovery-actions.ts`), not a browser call: the backend
 * applies breach screening and records `has_password` on the way through.
 */

// Errors the customer can act on

/** Turns every Cognito error into something the customer can act on; never a raw exception. */
export function authErrorMessage(err: unknown, context: "password" | "code" = "password"): string {
  const name = (err as { name?: string })?.name ?? ""

  switch (name) {
    case "UsernameExistsException":
      return "An account already exists with that email. Try signing in instead."
    case "NotAuthorizedException":
      // On the password route a credential mismatch; on the code route the attempts are used up. The
      // code-route wording is the same as for an unknown address, so it reveals nothing.
      return context === "code"
        ? "That didn't work. Request a new code and try again."
        : "That email and password don't match. Check them and try again, or reset your password."
    case "UserNotFoundException":
      // prevent_user_existence_errors is on, so this should not surface; if it does, existence is not confirmed.
      return "That email and password don't match. Check them and try again."
    case "CodeMismatchException":
      return "That code isn't right. Check it and try again."
    case "ExpiredCodeException":
      // "Send another one": there is a resend control.
      return "That code has expired. Send another one."
    case "LimitExceededException":
    case "TooManyRequestsException":
    case "TooManyFailedAttemptsException":
      return "Too many attempts. Wait a few minutes and try again."
    case "InvalidPasswordException":
      // The pool requires length only (no composition rules), stated from `PASSWORD_MIN_LENGTH`.
      return `That password is too short. Use at least ${PASSWORD_MIN_LENGTH} characters - no special characters required.`
    case "UserLambdaValidationException":
      // The linking trigger refused: almost always an unverified email from the provider.
      return "We couldn't link that account. Make sure the email on your Google account is verified, then try again."
    case "InvalidParameterException":
      return "Something in that form wasn't quite right. Check it and try again."
    case "SignInException":
      // The client gave up before the server: Amplify's per-tab challenge state expires after three
      // minutes, the code after five. Recoverable: the caller returns to the email step, address kept.
      return "Your sign-in timed out. Send a new code to continue."
    case "ForbiddenException":
      // The WAF rate rule (100 requests / 5 min / IP) blocked it before Cognito, as a bare 403. Waiting works.
      return "Too many attempts from this network. Wait a few minutes and try again."
    default:
      return "Something went wrong. Please try again."
  }
}

/** The shopper's copy is coarse, so the exception name (never the message or address) goes to the console. */
export function logAuthFailure(stage: string, err: unknown): void {
  const name = (err as { name?: string } | null)?.name ?? "UnknownError"
  console.warn(`[auth] ${stage} failed: ${name}`)
}

/** The client-side challenge-state expiry, not a Cognito refusal? The caller returns to the email step, address kept, for a fresh code. */
export function isStaleSignInSession(err: unknown): boolean {
  return (err as { name?: string })?.name === "SignInException"
}

export const ROUTE_LABEL: Record<CredentialRoute, string> = {
  password: "password",
  otp: "email code",
  google: "Google",
}
