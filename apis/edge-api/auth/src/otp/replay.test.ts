import { describe, expect, it } from "vitest";
import { digestCode, encodeEnvelope } from "./codec.js";
import { OTP_TTL_SECONDS, decideNextStep, envelopeFromSession, verifyAnswer } from "./policy.js";
import { CUSTOM_CHALLENGE, type ChallengeResult } from "./types.js";

/**
 * US3 — expiry, single-use and supersession (035 T088; FR-008, FR-009, FR-010, SC-006).
 *
 * ⚠ TWO OF THESE THREE ARE STRUCTURAL, NOT ENFORCED BY A FLAG, and the tests are written to say so.
 *
 *  • **Single-use** (FR-009) has no `used` boolean anywhere. A consumed code belongs to a completed
 *    authentication session, and there is no API by which a completed session can be answered
 *    again. That is stronger than a flag, which could be checked and then raced.
 *  • **Supersession** (FR-010) likewise: each `InitiateAuth` mints a new Cognito `Session` with its
 *    own `challengeMetadata`. An older code cannot be submitted against a newer session, and the
 *    older session cannot be resumed without its own `Session` string, which the client discarded.
 *  • **Expiry** (FR-008) is the one that IS enforced in code, because nothing else can enforce it —
 *    see below.
 */

const KEY = "test-key-not-a-real-secret";
const NOW = 1_800_000_000;

describe("expiry (FR-008)", () => {
  const envelope = { issuedAt: NOW, digest: digestCode("123456", KEY) };

  it("accepts inside the window and refuses one second past it", () => {
    const last = NOW + OTP_TTL_SECONDS;
    expect(verifyAnswer({ answer: "123456", envelope, key: KEY, nowSeconds: last }).ok).toBe(true);
    expect(verifyAnswer({ answer: "123456", envelope, key: KEY, nowSeconds: last + 1 })).toEqual({
      ok: false,
      reason: "expired",
    });
  });

  it("⚠ is enforced HERE and not by AuthSessionValidity", () => {
    // AuthSessionValidity bounds the Session token BETWEEN round trips and is REFRESHED on each
    // one, so a shopper answering slowly three times would keep a stale code alive well past five
    // minutes if we relied on it. Its range is also 3-15 minutes, so it cannot express 5 exactly
    // AND leave room for three attempts.
    expect(OTP_TTL_SECONDS).toBe(300);

    // Simulate three slow attempts, each inside a refreshed session window but drifting past the
    // code's own life. The code must die on wall-clock, not on session activity.
    const attempts = [NOW + 120, NOW + 240, NOW + 360];
    const verdicts = attempts.map(
      (t) => verifyAnswer({ answer: "123456", envelope, key: KEY, nowSeconds: t }).ok,
    );
    expect(verdicts).toEqual([true, true, false]);
  });

  it("an expired code is refused even when the digest matches perfectly", () => {
    const verdict = verifyAnswer({
      answer: "123456",
      envelope,
      key: KEY,
      nowSeconds: NOW + OTP_TTL_SECONDS + 3600,
    });
    expect(verdict).toEqual({ ok: false, reason: "expired" });
  });
});

describe("single use (FR-009)", () => {
  it("⚠ is structural — a consumed session has no envelope to answer again", () => {
    // After a successful answer the session ends. `envelopeFromSession` on a session whose last
    // entry is a SUCCESS still returns the envelope (Cognito would not call Create again), but
    // there is no path that submits against it: DefineAuthChallenge returns issue-tokens and the
    // flow is over. This test pins the shape rather than a flag that does not exist.
    const envelope = { issuedAt: NOW, digest: digestCode("123456", KEY) };
    const consumed: ChallengeResult[] = [
      {
        challengeName: CUSTOM_CHALLENGE,
        challengeResult: true,
        challengeMetadata: encodeEnvelope(envelope),
      },
    ];
    // The verify trigger is never reached again for this session — proven by the state machine.
    expect(decideNextStep(consumed, false)).toEqual({ kind: "issue-tokens" });
  });
});

describe("supersession (FR-010)", () => {
  it("⚠ a new sign-in carries a DIFFERENT envelope, so the old code cannot verify", () => {
    const first = { issuedAt: NOW, digest: digestCode("111111", KEY) };
    const second = { issuedAt: NOW + 30, digest: digestCode("222222", KEY) };

    // The shopper requested a second code. Submitting the FIRST one against the second session:
    expect(verifyAnswer({ answer: "111111", envelope: second, key: KEY, nowSeconds: NOW + 60 })).toEqual(
      { ok: false, reason: "mismatch" },
    );
    // …and the second code does work.
    expect(verifyAnswer({ answer: "222222", envelope: second, key: KEY, nowSeconds: NOW + 60 }).ok).toBe(
      true,
    );
    expect(first.digest).not.toBe(second.digest);
  });

  it("an empty or corrupt carried envelope degrades to 'no envelope', never to a pass", () => {
    for (const meta of [undefined, "", "garbage", "v9:1:aa"]) {
      const recovered = envelopeFromSession([
        { challengeName: CUSTOM_CHALLENGE, challengeResult: false, challengeMetadata: meta },
      ]);
      expect(recovered).toBeNull();
      expect(
        verifyAnswer({ answer: "123456", envelope: recovered, key: KEY, nowSeconds: NOW }),
      ).toEqual({ ok: false, reason: "no-envelope" });
    }
  });
});
