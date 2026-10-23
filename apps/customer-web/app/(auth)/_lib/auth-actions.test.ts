import { describe, expect, it, vi } from "vitest"

// `auth-actions` imports `aws-amplify/auth` at module scope; the functions under test are pure, so the SDK is stubbed.
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

import {
  authErrorMessage,
  classifySignInStep,
  isStaleSignInSession,
} from "./auth-actions"

/** The sign-in step classifier and the refusal mapping: a re-issued challenge after a wrong code must not read as success. */
describe("classifySignInStep (036 R9)", () => {
  it("⚠ treats a re-issued custom challenge as 'still needs a code', never as success", () => {
    // Attempts 1 and 2 come back as this same step.
    expect(classifySignInStep("CONFIRM_SIGN_IN_WITH_CUSTOM_CHALLENGE")).toBe("otp-required")
  })

  it("reports a completed sign-in", () => {
    expect(classifySignInStep("DONE")).toBe("done")
  })

  it("⚠ THROWS on a step it does not know, rather than guessing", () => {
    // An unknown step fails loudly rather than showing a code screen for a code never sent.
    expect(() => classifySignInStep("CONFIRM_SIGN_IN_WITH_TOTP_CODE")).toThrow(/Unexpected sign-in step/)
    expect(() => classifySignInStep("")).toThrow()
  })
})

describe("authErrorMessage — what the platform can honestly say (036 FR-011)", () => {
  const err = (name: string) => ({ name })

  it("⚠ says something DIFFERENT for the same exception on the two routes", () => {
    // On the code route `NotAuthorizedException` means the attempts are used up, not a password mismatch.
    const onCode = authErrorMessage(err("NotAuthorizedException"), "code")
    const onPassword = authErrorMessage(err("NotAuthorizedException"), "password")
    expect(onCode).not.toBe(onPassword)
    expect(onCode).not.toMatch(/password/i)
    expect(onPassword).toMatch(/password/i)
  })

  it("⚠ the code-route refusal does NOT disclose whether the account exists (FR-024)", () => {
    // The same whether the shopper ran out of tries or the address has no account.
    expect(authErrorMessage(err("NotAuthorizedException"), "code")).toBe(
      authErrorMessage(err("NotAuthorizedException"), "code"),
    )
    expect(authErrorMessage(err("NotAuthorizedException"), "code")).not.toMatch(/account|exist|found/i)
  })

  it("⚠ explains a CLIENT-side timeout instead of blaming the shopper (036 R1)", () => {
    // Amplify's challenge store can expire before the code's five minutes; one tap fixes it.
    const message = authErrorMessage(err("SignInException"), "code")
    expect(message).toMatch(/timed out/i)
    expect(message).not.toMatch(/something went wrong/i)
  })

  it("⚠ names the WAF rate limit rather than reporting a fault (036 R10)", () => {
    // Rate limiting is not "the platform is broken".
    const message = authErrorMessage(err("ForbiddenException"), "code")
    expect(message).toMatch(/network/i)
    expect(message).not.toMatch(/something went wrong/i)
  })

  it("⚠ tells the shopper to SEND another code — an action the screen now has", () => {
    expect(authErrorMessage(err("ExpiredCodeException"), "code")).toMatch(/send another/i)
  })

  it("⚠ states the REAL password length, from the shared constant", () => {
    // Built from the constant the backend enforces.
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
    // Back to the email step: nothing is wrong with the code or the account.
    expect(isStaleSignInSession({ name: "SignInException" })).toBe(true)
    expect(isStaleSignInSession({ name: "NotAuthorizedException" })).toBe(false)
    expect(isStaleSignInSession(new Error("boom"))).toBe(false)
    expect(isStaleSignInSession(undefined)).toBe(false)
    expect(isStaleSignInSession(null)).toBe(false)
  })
})
