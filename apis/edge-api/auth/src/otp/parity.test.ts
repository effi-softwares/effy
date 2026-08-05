import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * US3 — user-existence parity (035 T089; FR-016, FR-028, SC-007).
 *
 * ⚠ THIS IS THE HARDEST REQUIREMENT IN THE SLICE, and the one Cognito used to satisfy for free.
 *
 * `PreventUserExistenceErrors = ENABLED` does exactly two things: it suppresses
 * `UserNotFoundException`, and it sets `request.userNotFound` on the trigger event. AWS then hands
 * the problem over verbatim — *"We recommend that your Lambda functions maintain the same user
 * experience and account for latency. This way, the caller can't detect different behavior when
 * the user exists or doesn't exist."* It offers no mechanism for the latency half.
 *
 * Get this wrong and the sign-in form becomes a customer-email enumeration oracle: anyone can
 * discover who shops at Effy by watching which addresses answer differently — or merely faster.
 *
 * ⚠ WHAT THESE TESTS CANNOT PROVE. Timing parity is asserted structurally here (the same calls
 * happen on both paths), not measured. Real latency is measured by an operator against the dev pool
 * in quickstart §5 check 8 and SC-007. A unit test on a mocked SES client cannot tell you what a
 * network round trip costs.
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
    // ⚠ This is the structural half of timing parity. A phantom path that SKIPPED the SES call
    // would return measurably sooner, and existence would leak despite identical response bodies.
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

    // The mailer decides the destination from this flag; the address is passed but not used.
    expect(call?.phantom).toBe(true);
  });

  it("⚠ reserves the issuance budget for an unknown address too", async () => {
    // Two leaks in one. If the counter were only written for real accounts, its absence would be a
    // second oracle for anyone who could read the table — and, more practically, unknown addresses
    // would get unlimited free probing.
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
    // Both carry a masked destination of the same SHAPE — the phantom one masks the address the
    // caller supplied, which is exactly what a real one does.
    expect(phantom.response.publicChallengeParameters["maskedDestination"]).toMatch(/^.•+@/);
  });

  it("⚠ NEVER THROWS on either path — trigger error text reaches the client verbatim", async () => {
    // Cognito surfaces trigger errors as `{{[trigger]}} failed with error {{[text]}}`. A thrown
    // `new Error("no email attribute for user")` would be both a crash and an oracle.
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
    // A short-circuit refusal on attempt one would make the ROUND-TRIP COUNT the oracle, which no
    // amount of identical response bodies would hide.
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
    // Returning `false` early for `userNotFound` would skip the HMAC and the comparison, making the
    // phantom path measurably faster per attempt.
    const { handler } = await import("../functions/verify-auth-challenge.js");
    const { digestCode } = await import("./codec.js");

    const params = {
      digest: digestCode("123456", "test-key"),
      issuedAt: String(Math.floor(Date.now() / 1000)),
    };

    // ⚠ EACH CALL GETS ITS OWN `response` OBJECT. Spreading a shared `base` looks harmless but the
    // handler MUTATES `event.response`, and a spread copies the nested object by REFERENCE — so
    // both results would point at the same object and the second call would overwrite the first.
    // That is a fixture bug that reads as a code failure, and it cost a debugging round here.
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
