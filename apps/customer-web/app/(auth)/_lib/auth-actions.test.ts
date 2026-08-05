import { describe, expect, it, vi } from "vitest"

// ⚠ `auth-actions` imports `aws-amplify/auth` at module scope. The functions under test are PURE and
// touch none of it, but the import must resolve — so the SDK is stubbed rather than loaded. Nothing
// below asserts on a mock: these are decision functions, and the mock only satisfies the import graph.
vi.mock("aws-amplify/auth", () => ({
  autoSignIn: vi.fn(),
  confirmSignIn: vi.fn(),
  confirmSignUp: vi.fn(),
  resetPassword: vi.fn(),
  confirmResetPassword: vi.fn(),
  resendSignUpCode: vi.fn(),
  signIn: vi.fn(),
  signInWithRedirect: vi.fn(),
  signUp: vi.fn(),
}))

import { PASSWORD_MIN_LENGTH } from "@effy/shared-types"

import { authErrorMessage, classifySignInStep, isStaleSignInSession } from "./auth-actions"

/**
 * 036 T057 — the sign-in step classifier and the refusal mapping.
 *
 * ⚠ `classifySignInStep` EXISTED SINCE 035, WAS CORRECT, AND WAS CALLED BY NOTHING. That is why this
 * file exists. The storefront discarded `confirmSignIn`'s result and treated a re-issued challenge as
 * a successful sign-in, so a wrong code on attempt 1 or 2 — which raises no exception at all, because
 * Cognito simply asks again — navigated a **still-signed-out** shopper away with nothing on screen.
 * An exported-but-uncalled function is invisible to type checks, tests and guards alike; the only
 * thing that catches it is asserting the behaviour the caller is supposed to produce.
 */
describe("classifySignInStep (036 R9)", () => {
  it("⚠ treats a re-issued custom challenge as 'still needs a code', never as success", () => {
    // THE CASE THE DEFECT TURNED ON. Attempts 1 and 2 come back as this same step.
    expect(classifySignInStep("CONFIRM_SIGN_IN_WITH_CUSTOM_CHALLENGE")).toBe("otp-required")
  })

  it("still accepts Cognito's managed factor during the rollout", () => {
    // Both flows coexist on the pool, so a session begun under the managed factor still completes.
    expect(classifySignInStep("CONFIRM_SIGN_IN_WITH_EMAIL_CODE")).toBe("otp-required")
  })

  it("reports a completed sign-in", () => {
    expect(classifySignInStep("DONE")).toBe("done")
  })

  it("⚠ THROWS on a step it does not know, rather than guessing", () => {
    // Silently defaulting is how a new Cognito step becomes "a code screen for a code that was never
    // sent". Failing loudly is the point.
    expect(() => classifySignInStep("CONFIRM_SIGN_IN_WITH_TOTP_CODE")).toThrow(/Unexpected sign-in step/)
    expect(() => classifySignInStep("")).toThrow()
  })
})

describe("authErrorMessage — what the platform can honestly say (036 FR-011)", () => {
  const err = (name: string) => ({ name })

  it("⚠ says something DIFFERENT for the same exception on the two routes", () => {
    // `NotAuthorizedException` means "wrong password" on the password route and "you used all three
    // code attempts" on the code route. Telling a passwordless shopper their "email and password
    // don't match" is nonsense they cannot act on — there is no password to check.
    const onCode = authErrorMessage(err("NotAuthorizedException"), "code")
    const onPassword = authErrorMessage(err("NotAuthorizedException"), "password")
    expect(onCode).not.toBe(onPassword)
    expect(onCode).not.toMatch(/password/i)
    expect(onPassword).toMatch(/password/i)
  })

  it("⚠ the code-route refusal does NOT disclose whether the account exists (FR-024)", () => {
    // It must read the same whether the shopper ran out of tries or the address has no account.
    expect(authErrorMessage(err("NotAuthorizedException"), "code")).toBe(
      authErrorMessage(err("NotAuthorizedException"), "code"),
    )
    expect(authErrorMessage(err("NotAuthorizedException"), "code")).not.toMatch(/account|exist|found/i)
  })

  it("⚠ explains a CLIENT-side timeout instead of blaming the shopper (036 R1)", () => {
    // Amplify's challenge store expires at three minutes on a hard reload — shorter than the code's
    // five-minute TTL. Before this it fell through to "Something went wrong", which is both unhelpful
    // and untrue: nothing went wrong, and one tap fixes it.
    const message = authErrorMessage(err("SignInException"), "code")
    expect(message).toMatch(/timed out/i)
    expect(message).not.toMatch(/something went wrong/i)
  })

  it("⚠ names the WAF rate limit rather than reporting a fault (036 R10)", () => {
    // This was unhandled on every surface, so a person being rate-limited by their own network was
    // told the platform was broken.
    const message = authErrorMessage(err("ForbiddenException"), "code")
    expect(message).toMatch(/network/i)
    expect(message).not.toMatch(/something went wrong/i)
  })

  it("⚠ tells the shopper to SEND another code — an action the screen now has", () => {
    // The old copy said "Ask for a new one" when no resend existed anywhere on the platform.
    expect(authErrorMessage(err("ExpiredCodeException"), "code")).toMatch(/send another/i)
  })

  it("⚠ states the REAL password length, from the shared constant", () => {
    // It used to promise "at least 8 characters with upper and lower case letters and a number" —
    // both too short and falsely restrictive. Built from the constant the backend enforces so it
    // cannot drift again.
    const message = authErrorMessage(err("InvalidPasswordException"))
    expect(message).toContain(String(PASSWORD_MIN_LENGTH))
    expect(message).not.toMatch(/upper and lower case/i)
  })

  it("falls back to something actionable for an unknown failure", () => {
    expect(authErrorMessage(err("SomeBrandNewCognitoException"))).toMatch(/try again/i)
  })
})

describe("isStaleSignInSession", () => {
  it("⚠ distinguishes the client giving up from the platform refusing", () => {
    // The caller must route back to the email step rather than showing a refusal in place: there is
    // nothing wrong with the code they typed, and nothing wrong with the account.
    expect(isStaleSignInSession({ name: "SignInException" })).toBe(true)
    expect(isStaleSignInSession({ name: "NotAuthorizedException" })).toBe(false)
    expect(isStaleSignInSession(new Error("boom"))).toBe(false)
    expect(isStaleSignInSession(undefined)).toBe(false)
    expect(isStaleSignInSession(null)).toBe(false)
  })
})
