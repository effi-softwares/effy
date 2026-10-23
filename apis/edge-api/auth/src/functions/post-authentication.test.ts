import { beforeEach, describe, expect, it, vi } from "vitest";

/** CUSTOM_AUTH does not mark the email verified, and a silent miss breaks Google linking weeks later. */

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
    // Already verified: no call inside Cognito's 5 s budget.
    const { handler } = await import("./post-authentication.js");
    await handler(event({ email: "shopper@example.com", email_verified: "true" }));
    expect(send).not.toHaveBeenCalled();
  });

  it("does nothing when there is no email attribute", async () => {
    // A federated or admin-created account may arrive without one.
    const { handler } = await import("./post-authentication.js");
    await handler(event({}));
    expect(send).not.toHaveBeenCalled();
  });

  it("⚠ NEVER throws when the attribute write fails", async () => {
    // The sign-in already succeeded: failing here would lock the user out.
    const { handler } = await import("./post-authentication.js");
    send.mockRejectedValueOnce(new Error("AdminUpdateUserAttributes failed"));

    await expect(
      handler(event({ email: "shopper@example.com", email_verified: "false" })),
    ).resolves.toBeDefined();
  });

  it("⚠ but a failure is NOT silent — it emits the metric", async () => {
    // The metric is the only signal of drift into the unverified state.
    const { handler } = await import("./post-authentication.js");
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    send.mockRejectedValueOnce(new Error("boom"));

    await handler(event({ email: "shopper@example.com", email_verified: "false" }));

    const emitted = log.mock.calls.map((c) => String(c[0])).join("\n");
    expect(emitted).toContain("otp_email_verify_failed");
    // The metric carries the pool only, never the address.
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
