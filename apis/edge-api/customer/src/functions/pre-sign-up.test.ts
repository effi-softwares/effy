import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** `autoVerifyEmail` must never be set: federated linking trusts that field. */

vi.mock("../lib/cognito", () => ({ cognitoAdmin: () => ({}) }));

const POOL = "ap-southeast-2_CUSTOMER";

function nativeSignUp() {
  return {
    version: "1",
    region: "ap-southeast-2",
    userPoolId: POOL,
    triggerSource: "PreSignUp_SignUp",
    userName: "shopper@example.com",
    callerContext: { awsSdkVersion: "3", clientId: "abc" },
    request: {
      userAttributes: { email: "shopper@example.com" },
      validationData: {},
    },
    response: {
      autoConfirmUser: false,
      autoVerifyEmail: false,
      autoVerifyPhone: false,
    },
  } as never;
}

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  delete process.env.AUTO_CONFIRM_SIGNUP;
});

describe("pre-sign-up — native sign-up", () => {
  it("⚠ does NOT auto-confirm by default", async () => {
    // Off: auto-confirming buys an email-squatting risk until it is shown to be needed.
    delete process.env.AUTO_CONFIRM_SIGNUP;
    const { handler } = await import("./pre-sign-up.js");
    const out = await handler(nativeSignUp(), {} as never, (() => {}) as never);

    expect((out as { response: { autoConfirmUser: boolean } }).response.autoConfirmUser).toBe(false);
  });

  it("auto-confirms when the flag is explicitly enabled", async () => {
    process.env.AUTO_CONFIRM_SIGNUP = "true";
    const { handler } = await import("./pre-sign-up.js");
    const out = await handler(nativeSignUp(), {} as never, (() => {}) as never);

    expect((out as { response: { autoConfirmUser: boolean } }).response.autoConfirmUser).toBe(true);
  });

  it("treats any value other than the exact string 'true' as off", async () => {
    // Only the literal string enables it.
    for (const value of ["1", "yes", "TRUE", "", "false"]) {
      vi.resetModules();
      process.env.AUTO_CONFIRM_SIGNUP = value;
      const { handler } = await import("./pre-sign-up.js");
      const out = await handler(nativeSignUp(), {} as never, (() => {}) as never);
      expect(
        (out as { response: { autoConfirmUser: boolean } }).response.autoConfirmUser,
        `value: ${value}`,
      ).toBe(false);
    }
  });

  it("⚠ NEVER auto-verifies the email — not even with auto-confirm on (Principle IV)", async () => {
    process.env.AUTO_CONFIRM_SIGNUP = "true";
    const { handler } = await import("./pre-sign-up.js");
    const out = await handler(nativeSignUp(), {} as never, (() => {}) as never);

    const response = (out as { response: { autoVerifyEmail: boolean } }).response;
    // Confirmed is not verified: the address is verified only once a code sent to it is answered.
    expect(response.autoVerifyEmail).toBe(false);
  });
});
