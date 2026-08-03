import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The pre-sign-up trigger's NATIVE sign-up branch (035 T101).
 *
 * The federated branch's decision logic is already covered by `lib/account-linking.test.ts`; this
 * file exists for the auto-confirm flag 035 added, and for one property that matters more than the
 * flag itself.
 *
 * ⚠ `autoVerifyEmail` MUST NEVER BE SET — under any flag, on any branch. Setting it would mark an
 * address verified that nobody has proved control of, and constitution Principle IV makes federated
 * linking depend on exactly that field: "linking MUST require a provider-asserted verified email …
 * linking on an unverified email is an account-takeover primitive, and is forbidden". Auto-verifying
 * at sign-up would hand an attacker a verified email on an address they merely typed.
 */

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
    // The flag is off until spike T003(a) shows Cognito refuses an UNCONFIRMED user before the
    // custom-auth triggers fire. Auto-confirming early buys an email-squatting risk for no benefit.
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
    // A rate-limit-shaped mistake: "1", "yes", "TRUE" must not silently enable a security-relevant
    // behaviour. Only the literal string counts.
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
    // Confirmed ≠ verified. The account can sign in; the ADDRESS is only marked verified once a
    // code sent to it has actually been answered (035 FR-020, in the post-authentication trigger).
    expect(response.autoVerifyEmail).toBe(false);
  });
});
