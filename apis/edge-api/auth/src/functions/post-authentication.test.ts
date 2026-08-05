import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * US4 — reinstating `email_verified` (035 T102; FR-020, SC-009).
 *
 * ⚠ THIS IS THE MOST LIKELY SILENT, DELAYED FAILURE IN THE WHOLE SLICE — and it exists because of a
 * behaviour we are GIVING UP, not one we are adding.
 *
 * Managed passwordless EMAIL_OTP marks the address verified and moves a new account out of
 * UNCONFIRMED when a correct code is entered. AWS scopes that explicitly to passwordless
 * authentication and email MFA; `CUSTOM_AUTH` is on neither list, because Cognito has no idea our
 * opaque Lambda verdict involved an email at all.
 *
 * Miss this and NOTHING BREAKS VISIBLY. Accounts simply accumulate with `email_verified: false`,
 * and the failure surfaces weeks later when someone tries Google sign-in and linking refuses —
 * which, under constitution Principle IV, it MUST, because linking on an unverified email is an
 * account-takeover primitive.
 *
 * That delay is exactly why this is tested rather than trusted.
 */

const send = vi.fn();

vi.mock("@aws-sdk/client-cognito-identity-provider", async (orig) => {
  const actual = await orig<typeof import("@aws-sdk/client-cognito-identity-provider")>();
  return {
    ...actual,
    CognitoIdentityProviderClient: class {
      send = send;
    },
  };
});

const POOL = "ap-southeast-2_CUSTOMER";

beforeEach(() => {
  send.mockReset();
  send.mockResolvedValue({});
  vi.resetModules();
});

function event(attrs: Record<string, string>) {
  return {
    version: "1",
    region: "ap-southeast-2",
    userPoolId: POOL,
    triggerSource: "PostAuthentication_Authentication",
    userName: "shopper@example.com",
    callerContext: { awsSdkVersion: "3", clientId: "abc" },
    request: { userAttributes: attrs, newDeviceUsed: false },
    response: {},
  } as never;
}

describe("post-authentication", () => {
  it("sets email_verified when the account is not yet verified", async () => {
    const { handler } = await import("./post-authentication.js");
    await handler(event({ email: "shopper@example.com", email_verified: "false" }));

    expect(send).toHaveBeenCalledTimes(1);
    const input = send.mock.calls[0]?.[0].input;
    expect(input.UserPoolId).toBe(POOL);
    expect(input.Username).toBe("shopper@example.com");
    expect(input.UserAttributes).toEqual([{ Name: "email_verified", Value: "true" }]);
  });

  it("⚠ is idempotent — an already-verified account costs no round trip", async () => {
    // Every existing customer and every subsequent sign-in hits this path. A call here would spend
    // part of Cognito's 5-second trigger budget on a no-op, on every sign-in, forever.
    const { handler } = await import("./post-authentication.js");
    await handler(event({ email: "shopper@example.com", email_verified: "true" }));
    expect(send).not.toHaveBeenCalled();
  });

  it("does nothing when there is no email attribute", async () => {
    // A federated or admin-created account may legitimately arrive without one. Not an error.
    const { handler } = await import("./post-authentication.js");
    await handler(event({}));
    expect(send).not.toHaveBeenCalled();
  });

  it("⚠ NEVER throws when the attribute write fails", async () => {
    // The sign-in has ALREADY SUCCEEDED by this point. Failing the trigger here would fail an
    // authentication that legitimately completed, turning a bookkeeping problem into a lockout.
    const { handler } = await import("./post-authentication.js");
    send.mockRejectedValueOnce(new Error("AdminUpdateUserAttributes failed"));

    await expect(
      handler(event({ email: "shopper@example.com", email_verified: "false" })),
    ).resolves.toBeDefined();
  });

  it("⚠ but a failure is NOT silent — it emits the metric", async () => {
    // The whole hazard is that this fails invisibly. Without the metric, accounts drift into the
    // unverified state and nobody learns until Google linking starts refusing.
    const { handler } = await import("./post-authentication.js");
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    send.mockRejectedValueOnce(new Error("boom"));

    await handler(event({ email: "shopper@example.com", email_verified: "false" }));

    const emitted = log.mock.calls.map((c) => String(c[0])).join("\n");
    expect(emitted).toContain("otp_email_verify_failed");
    // ⚠ And the metric carries the pool only — never the address (FR-014).
    expect(emitted).not.toContain("shopper@example.com");
    log.mockRestore();
  });

  it("returns the event so Cognito does not treat the trigger as failed", async () => {
    const { handler } = await import("./post-authentication.js");
    const out = await handler(event({ email: "shopper@example.com", email_verified: "true" }));
    expect(out).toBeDefined();
    expect(out.userPoolId).toBe(POOL);
  });
});
