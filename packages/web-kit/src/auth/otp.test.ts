import { describe, expect, it, vi } from "vitest";

vi.mock("aws-amplify/auth", () => ({
  signIn: vi.fn(),
  confirmSignIn: vi.fn(),
  signOut: vi.fn(),
  fetchAuthSession: vi.fn(),
}));

import { otpErrorMessage, START_SIGN_IN_ERROR } from "./otp";

function cognitoError(name: string): Error {
  const err = new Error("cognito");
  err.name = name;
  return err;
}

describe("otpErrorMessage", () => {
  it("maps a wrong code to actionable copy", () => {
    expect(otpErrorMessage(cognitoError("CodeMismatchException"))).toMatch(/isn't right/i);
  });

  it("maps an expired code to a request-a-new-one message", () => {
    expect(otpErrorMessage(cognitoError("ExpiredCodeException"))).toMatch(/expired/i);
  });

  it("maps every throttle exception to one wait-and-retry message", () => {
    for (const name of [
      "LimitExceededException",
      "TooManyRequestsException",
      "TooManyFailedAttemptsException",
    ]) {
      expect(otpErrorMessage(cognitoError(name))).toMatch(/too many attempts/i);
    }
  });

  it("falls back to generic copy for an unknown failure, leaking nothing", () => {
    const message = otpErrorMessage(cognitoError("SomeInternalCognitoThing"));
    expect(message).toMatch(/couldn't verify that code/i);
    expect(message).not.toMatch(/SomeInternalCognitoThing/);
  });

  it("never leaks the raw error message", () => {
    expect(otpErrorMessage(new Error("user pool us-east-1_abc123 not found"))).not.toMatch(
      /us-east-1/,
    );
  });
});

describe("START_SIGN_IN_ERROR", () => {
  // The email step must not become an account-existence oracle: an unprovisioned address and a
  // provisioned one produce identical copy (spec edge case).
  it("says nothing about whether the account exists", () => {
    expect(START_SIGN_IN_ERROR).not.toMatch(/exist|unknown|not found|no account/i);
  });
});
