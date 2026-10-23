import { beforeEach, describe, expect, it, vi } from "vitest";

/** Adapters are mocked at the module seam; `policy.ts` and `codec.ts` are real. */

vi.mock("../otp/mailer.js", () => ({ sendCode: vi.fn(), resetMailerForTests: vi.fn() }));
vi.mock("../otp/issuance.js", () => ({ reserve: vi.fn(), resetIssuanceForTests: vi.fn() }));
vi.mock("../lib/secret.js", () => ({
  hmacKey: vi.fn(async () => "test-key"),
  resetSecretForTests: vi.fn(),
}));

const POOL = "ap-southeast-2_CUSTOMER";

beforeEach(async () => {
  vi.clearAllMocks();
  vi.resetModules();
  process.env.CUSTOMER_USER_POOL_ID = POOL;
  process.env.MAIL_SENDER = "Effy <no-reply@dev.effyshopping.com>";
  const { resetAudienceIndexForTests } = await import("../lib/audience.js");
  resetAudienceIndexForTests();
  const { reserve } = await import("../otp/issuance.js");
  vi.mocked(reserve).mockResolvedValue({ allowed: true, count: 1 });
});

function createEvent(overrides: Record<string, unknown> = {}) {
  return {
    version: "1",
    region: "ap-southeast-2",
    userPoolId: POOL,
    triggerSource: "CreateAuthChallenge_Authentication",
    userName: "shopper@example.com",
    callerContext: { awsSdkVersion: "3", clientId: "abc" },
    request: {
      userAttributes: { email: "shopper@example.com" },
      challengeName: "CUSTOM_CHALLENGE",
      session: [],
      ...(overrides["request"] as object),
    },
    response: {
      publicChallengeParameters: {},
      privateChallengeParameters: {},
      challengeMetadata: "",
    },
    ...overrides,
  } as never;
}

describe("createAuthChallenge", () => {
  it("generates, sends and counts on the first invocation", async () => {
    const { handler } = await import("./create-auth-challenge.js");
    const { sendCode } = await import("../otp/mailer.js");
    const { reserve } = await import("../otp/issuance.js");

    const event = createEvent();
    const out = await handler(event);

    expect(sendCode).toHaveBeenCalledTimes(1);
    expect(reserve).toHaveBeenCalledTimes(1);
    expect(out.response.challengeMetadata).toMatch(/^v1:[0-9]+:[0-9a-f]{64}$/);
  });

  it("⚠ a wrong answer does NOT trigger a second email or a second count (invariant 2)", async () => {
    // Re-mailing on a typo would fill the inbox and burn the hourly budget.
    const { handler } = await import("./create-auth-challenge.js");
    const { sendCode } = await import("../otp/mailer.js");
    const { reserve } = await import("../otp/issuance.js");

    const first = await handler(createEvent());
    const carried = first.response.challengeMetadata;

    vi.mocked(sendCode).mockClear();
    vi.mocked(reserve).mockClear();

    const retry = await handler(
      createEvent({
        request: {
          userAttributes: { email: "shopper@example.com" },
          challengeName: "CUSTOM_CHALLENGE",
          session: [
            { challengeName: "CUSTOM_CHALLENGE", challengeResult: false, challengeMetadata: carried },
          ],
        },
      }),
    );

    expect(sendCode).not.toHaveBeenCalled();
    expect(reserve).not.toHaveBeenCalled();
    // And the same code is still the valid one.
    expect(retry.response.challengeMetadata).toBe(carried);
    expect(retry.response.privateChallengeParameters["digest"]).toBe(
      first.response.privateChallengeParameters["digest"],
    );
  });

  it("⚠ publicChallengeParameters carries ONLY a masked destination (invariant 8)", async () => {
    const { handler } = await import("./create-auth-challenge.js");
    const out = await handler(createEvent());

    expect(Object.keys(out.response.publicChallengeParameters)).toEqual(["maskedDestination"]);
    const serialised = JSON.stringify(out.response.publicChallengeParameters);
    expect(serialised).not.toContain("shopper@example.com");
    expect(serialised).not.toMatch(/[0-9]{6}/);
    expect(serialised).not.toContain(out.response.privateChallengeParameters["digest"]);
  });

  it("⚠ reserves the counter for an UNKNOWN address, but mails the simulator (invariant 11, FR-016)", async () => {
    // The row's absence and a skipped SES call would each reveal existence.
    const { handler } = await import("./create-auth-challenge.js");
    const { sendCode } = await import("../otp/mailer.js");
    const { reserve } = await import("../otp/issuance.js");

    await handler(
      createEvent({
        request: {
          userAttributes: { email: "nobody@example.com" },
          challengeName: "CUSTOM_CHALLENGE",
          session: [],
          userNotFound: true,
        },
      }),
    );

    expect(reserve).toHaveBeenCalledTimes(1);
    expect(sendCode).toHaveBeenCalledTimes(1);
    expect(vi.mocked(sendCode).mock.calls[0]?.[0].phantom).toBe(true);
  });

  it("⚠ produces the SAME response shape for a known and an unknown address (FR-016)", async () => {
    const { handler } = await import("./create-auth-challenge.js");

    const real = await handler(createEvent());
    const phantom = await handler(
      createEvent({
        request: {
          userAttributes: { email: "nobody@example.com" },
          challengeName: "CUSTOM_CHALLENGE",
          session: [],
          userNotFound: true,
        },
      }),
    );

    expect(Object.keys(phantom.response.publicChallengeParameters)).toEqual(
      Object.keys(real.response.publicChallengeParameters),
    );
    expect(Object.keys(phantom.response.privateChallengeParameters).sort()).toEqual(
      Object.keys(real.response.privateChallengeParameters).sort(),
    );
  });

  it("⚠ NEVER throws — not on a send failure, an unknown pool, or a missing attribute (invariant 10)", async () => {
    // Cognito relays thrown text to the client verbatim.
    const { handler } = await import("./create-auth-challenge.js");
    const { sendCode } = await import("../otp/mailer.js");

    vi.mocked(sendCode).mockRejectedValueOnce(new Error("SES is down"));
    await expect(handler(createEvent())).resolves.toBeDefined();

    await expect(
      handler(createEvent({ userPoolId: "ap-southeast-2_UNKNOWN" })),
    ).resolves.toBeDefined();

    await expect(
      handler(
        createEvent({
          request: { userAttributes: {}, challengeName: "CUSTOM_CHALLENGE", session: [] },
        }),
      ),
    ).resolves.toBeDefined();
  });

  it("leaves no usable secret behind when the send fails, so verification cannot succeed", async () => {
    const { handler } = await import("./create-auth-challenge.js");
    const { sendCode } = await import("../otp/mailer.js");

    vi.mocked(sendCode).mockRejectedValueOnce(new Error("SES is down"));
    const out = await handler(createEvent());

    expect(out.response.challengeMetadata).toBe("");
    expect(out.response.privateChallengeParameters["digest"]).toBe("");
  });

  it("refuses past the rate limit without a usable secret (FR-012)", async () => {
    const { handler } = await import("./create-auth-challenge.js");
    const { reserve } = await import("../otp/issuance.js");
    const { sendCode } = await import("../otp/mailer.js");

    vi.mocked(reserve).mockResolvedValue({ allowed: false, retryAfterSeconds: 900 });
    const out = await handler(createEvent());

    expect(sendCode).not.toHaveBeenCalled();
    expect(out.response.challengeMetadata).toBe("");
  });
});

describe("verifyAuthChallenge", () => {
  async function verify(params: Record<string, string>, answer: string, userNotFound = false) {
    const { handler } = await import("./verify-auth-challenge.js");
    return handler({
      version: "1",
      region: "ap-southeast-2",
      userPoolId: POOL,
      triggerSource: "VerifyAuthChallengeResponse_Authentication",
      userName: "shopper@example.com",
      callerContext: { awsSdkVersion: "3", clientId: "abc" },
      request: {
        userAttributes: { email: "shopper@example.com" },
        privateChallengeParameters: params,
        challengeAnswer: answer,
        userNotFound,
      },
      response: { answerCorrect: false },
    } as never);
  }

  it("accepts the right code and rejects the wrong one", async () => {
    const { digestCode } = await import("../otp/codec.js");
    const params = {
      digest: digestCode("123456", "test-key"),
      issuedAt: String(Math.floor(Date.now() / 1000)),
    };

    expect((await verify(params, "123456")).response.answerCorrect).toBe(true);
    expect((await verify(params, "654321")).response.answerCorrect).toBe(false);
  });

  it("⚠ always refuses a phantom user, even with a digest that would otherwise match", async () => {
    const { digestCode } = await import("../otp/codec.js");
    const params = {
      digest: digestCode("123456", "test-key"),
      issuedAt: String(Math.floor(Date.now() / 1000)),
    };
    expect((await verify(params, "123456", true)).response.answerCorrect).toBe(false);
  });

  it("refuses an empty envelope (send failed, rate limited, or unknown pool)", async () => {
    expect((await verify({ digest: "", issuedAt: "0" }, "123456")).response.answerCorrect).toBe(false);
  });

  it("⚠ never throws on malformed private parameters (invariant 10)", async () => {
    await expect(verify({}, "123456")).resolves.toBeDefined();
    await expect(verify({ digest: "x", issuedAt: "not-a-number" }, "123456")).resolves.toBeDefined();
  });
});

describe("defineAuthChallenge", () => {
  async function decide(session: unknown[], userNotFound = false) {
    const { handler } = await import("./define-auth-challenge.js");
    return handler({
      version: "1",
      region: "ap-southeast-2",
      userPoolId: POOL,
      triggerSource: "DefineAuthChallenge_Authentication",
      userName: "shopper@example.com",
      callerContext: { awsSdkVersion: "3", clientId: "abc" },
      request: { userAttributes: {}, session, userNotFound },
      response: { issueTokens: false, failAuthentication: false },
    } as never);
  }

  it("issues a challenge, then tokens on success", async () => {
    expect((await decide([])).response.challengeName).toBe("CUSTOM_CHALLENGE");
    const ok = await decide([{ challengeName: "CUSTOM_CHALLENGE", challengeResult: true }]);
    expect(ok.response.issueTokens).toBe(true);
  });

  it("⚠ fails after three attempts (invariant 3)", async () => {
    const wrong = { challengeName: "CUSTOM_CHALLENGE", challengeResult: false };
    expect((await decide([wrong, wrong])).response.failAuthentication).toBe(false);
    expect((await decide([wrong, wrong, wrong])).response.failAuthentication).toBe(true);
  });

  it("⚠ never issues tokens for a foreign challenge (invariant 5)", async () => {
    const out = await decide([{ challengeName: "PASSWORD_VERIFIER", challengeResult: true }]);
    expect(out.response.issueTokens).toBe(false);
    expect(out.response.failAuthentication).toBe(true);
  });
});
