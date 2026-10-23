import { describe, expect, it } from "vitest";
import { digestCode, encodeEnvelope } from "./codec.js";
import { OTP_TTL_SECONDS, decideNextStep, envelopeFromSession, verifyAnswer } from "./policy.js";
import { CUSTOM_CHALLENGE, type ChallengeResult } from "./types.js";

/**
 * Single use and supersession are structural (a completed session cannot be answered again; each
 * InitiateAuth gets its own Session). Expiry is the one enforced in code.
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
    // AuthSessionValidity refreshes on every round trip, so it cannot bound the code's life.
    expect(OTP_TTL_SECONDS).toBe(300);

    // Three slow attempts drifting past the code's life: it must die on wall-clock time.
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
    // After success the flow is over; this pins the shape, as no `used` flag exists.
    const envelope = { issuedAt: NOW, digest: digestCode("123456", KEY) };
    const consumed: ChallengeResult[] = [
      {
        challengeName: CUSTOM_CHALLENGE,
        challengeResult: true,
        challengeMetadata: encodeEnvelope(envelope),
      },
    ];
    expect(decideNextStep(consumed, false)).toEqual({ kind: "issue-tokens" });
  });
});

describe("supersession (FR-010)", () => {
  it("⚠ a new sign-in carries a DIFFERENT envelope, so the old code cannot verify", () => {
    const first = { issuedAt: NOW, digest: digestCode("111111", KEY) };
    const second = { issuedAt: NOW + 30, digest: digestCode("222222", KEY) };

    // A second code was requested; the first is submitted against the second session.
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
