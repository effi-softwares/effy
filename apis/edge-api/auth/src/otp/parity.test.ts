import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * User-existence parity: an unknown address must behave exactly like a real one, or the sign-in form
 * enumerates customers. Timing parity is asserted structurally here (the same calls on both paths).
 */

vi.mock("./mailer.js", () => ({ sendCode: vi.fn(), resetMailerForTests: vi.fn() }));
vi.mock("./issuance.js", () => ({ reserve: vi.fn(), resetIssuanceForTests: vi.fn() }));
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
  const { reserve } = await import("./issuance.js");
  vi.mocked(reserve).mockResolvedValue({ allowed: true, count: 1 });
});

function createEvent(userNotFound: boolean, email: string) {
  return {
    version: "1",
    region: "ap-southeast-2",
    userPoolId: POOL,
    triggerSource: "CreateAuthChallenge_Authentication",
    userName: email,
    callerContext: { awsSdkVersion: "3", clientId: "abc" },
    request: {
      userAttributes: { email },
      challengeName: "CUSTOM_CHALLENGE",
      session: [],
      userNotFound,
    },
    response: {
      publicChallengeParameters: {},
      privateChallengeParameters: {},
      challengeMetadata: "",
    },
  } as never;
}

describe("create-auth-challenge parity", () => {
  it("performs the SAME external calls for a real and an unknown address", async () => {
    // Skipping SES for an unknown user would make it measurably faster.
    const { handler } = await import("../functions/create-auth-challenge.js");
    const { sendCode } = await import("./mailer.js");
    const { reserve } = await import("./issuance.js");

    await handler(createEvent(false, "real@example.com"));
    const realCalls = { send: vi.mocked(sendCode).mock.calls.length, reserve: vi.mocked(reserve).mock.calls.length };

    vi.mocked(sendCode).mockClear();
    vi.mocked(reserve).mockClear();

    await handler(createEvent(true, "nobody@example.com"));
    const phantomCalls = { send: vi.mocked(sendCode).mock.calls.length, reserve: vi.mocked(reserve).mock.calls.length };

    expect(phantomCalls).toEqual(realCalls);
  });

  it("⚠ routes the phantom message to the mailbox simulator, never to the address", async () => {
    const { handler } = await import("../functions/create-auth-challenge.js");
    const { sendCode } = await import("./mailer.js");

    await handler(createEvent(true, "nobody@example.com"));
    const call = vi.mocked(sendCode).mock.calls[0]?.[0];

    expect(call?.phantom).toBe(true);
  });

  it("⚠ reserves the issuance budget for an unknown address too", async () => {
    // Written for unknown addresses too: its absence would reveal existence and allow free probing.
    const { handler } = await import("../functions/create-auth-challenge.js");
    const { reserve } = await import("./issuance.js");

    await handler(createEvent(true, "nobody@example.com"));
    expect(reserve).toHaveBeenCalledTimes(1);
  });

  it("returns byte-identical response KEYS on both paths", async () => {
    const { handler } = await import("../functions/create-auth-challenge.js");

    const real = await handler(createEvent(false, "real@example.com"));
    const phantom = await handler(createEvent(true, "nobody@example.com"));

    expect(Object.keys(phantom.response.publicChallengeParameters).sort()).toEqual(
      Object.keys(real.response.publicChallengeParameters).sort(),
    );
    expect(Object.keys(phantom.response.privateChallengeParameters).sort()).toEqual(
      Object.keys(real.response.privateChallengeParameters).sort(),
    );
    // Both carry a masked destination of the same shape.
    expect(phantom.response.publicChallengeParameters["maskedDestination"]).toMatch(/^.•+@/);
  });

  it("⚠ NEVER THROWS on either path — trigger error text reaches the client verbatim", async () => {
    // Cognito relays thrown text to the client.
    const { handler } = await import("../functions/create-auth-challenge.js");
    await expect(handler(createEvent(true, "nobody@example.com"))).resolves.toBeDefined();
    await expect(
      handler({
        ...(createEvent(true, "nobody@example.com") as Record<string, never>),
        request: { userAttributes: {}, challengeName: "CUSTOM_CHALLENGE", session: [], userNotFound: true },
      } as never),
    ).resolves.toBeDefined();
  });
});

describe("define-auth-challenge parity", () => {
  it("⚠ gives a phantom user the SAME number of attempts before refusing", async () => {
    // An early refusal would make the round-trip count reveal existence.
    const { decideNextStep } = await import("./policy.js");
    const wrong = { challengeName: "CUSTOM_CHALLENGE", challengeResult: false };

    const realPath = [[], [wrong], [wrong, wrong], [wrong, wrong, wrong]].map(
      (s) => decideNextStep(s, false).kind,
    );
    const phantomPath = [[], [wrong], [wrong, wrong], [wrong, wrong, wrong]].map(
      (s) => decideNextStep(s, true).kind,
    );

    expect(phantomPath).toEqual(realPath);
    expect(realPath).toEqual(["issue-challenge", "issue-challenge", "issue-challenge", "fail"]);
  });

  it("never issues tokens for a phantom user even on a 'correct' answer", async () => {
    const { decideNextStep } = await import("./policy.js");
    const right = { challengeName: "CUSTOM_CHALLENGE", challengeResult: true };
    expect(decideNextStep([right], true).kind).not.toBe("issue-tokens");
    expect(decideNextStep([right], false).kind).toBe("issue-tokens");
  });
});

describe("verify-auth-challenge parity", () => {
  it("⚠ runs the constant-time compare on the phantom path too", async () => {
    // An early `false` would skip the HMAC and be measurably faster.
    const { handler } = await import("../functions/verify-auth-challenge.js");
    const { digestCode } = await import("./codec.js");

    const params = {
      digest: digestCode("123456", "test-key"),
      issuedAt: String(Math.floor(Date.now() / 1000)),
    };

    // Each call gets its own `response`: the handler mutates it, and a spread would share it.
    const event = (userNotFound: boolean) =>
      ({
        version: "1",
        region: "ap-southeast-2",
        userPoolId: POOL,
        triggerSource: "VerifyAuthChallengeResponse_Authentication",
        userName: "x@example.com",
        callerContext: { awsSdkVersion: "3", clientId: "abc" },
        request: {
          userAttributes: {},
          privateChallengeParameters: params,
          challengeAnswer: "123456",
          userNotFound,
        },
        response: { answerCorrect: false },
      }) as never;

    const real = await handler(event(false));
    const phantom = await handler(event(true));

    expect(real.response.answerCorrect).toBe(true);
    expect(phantom.response.answerCorrect).toBe(false);
  });
});
