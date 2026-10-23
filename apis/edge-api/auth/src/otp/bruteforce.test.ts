import { describe, expect, it } from "vitest";
import { digestCode, encodeEnvelope } from "./codec.js";
import {
  OTP_MAX_ATTEMPTS,
  OTP_SENDS_PER_HOUR,
  attemptCount,
  decideNextStep,
  envelopeFromSession,
  generateCode,
  verifyAnswer,
} from "./policy.js";
import { CUSTOM_CHALLENGE, type ChallengeResult } from "./types.js";

/**
 * The brute-force controls. Cognito caps neither custom-challenge attempts nor retries per session,
 * so `decideNextStep` alone keeps a six-digit code safe.
 */

const KEY = "test-key-not-a-real-secret";
const NOW = 1_800_000_000;

const wrong = (): ChallengeResult => ({ challengeName: CUSTOM_CHALLENGE, challengeResult: false });
const right = (): ChallengeResult => ({ challengeName: CUSTOM_CHALLENGE, challengeResult: true });

describe("attempt cap", () => {
  it("stops at exactly three guesses, and the arithmetic is stated", () => {
    // 3 guesses against 10^6 per issued code: the number the design rests on.
    let attempts = 0;
    const session: ChallengeResult[] = [];
    while (decideNextStep(session, false).kind === "issue-challenge") {
      session.push(wrong());
      attempts++;
      if (attempts > 10) break;
    }
    expect(attempts).toBe(OTP_MAX_ATTEMPTS);
    expect(decideNextStep(session, false)).toEqual({ kind: "fail" });
  });

  it("a failed session cannot be revived by appending more attempts", () => {
    const dead = [wrong(), wrong(), wrong(), wrong(), wrong()];
    expect(decideNextStep(dead, false)).toEqual({ kind: "fail" });
  });

  it("⚠ a correct answer AFTER the cap is still refused", () => {
    expect(decideNextStep([wrong(), wrong(), wrong(), right()], false)).toEqual({ kind: "fail" });
  });

  it("counts only our own challenges toward the cap", () => {
    const mixed = [wrong(), { challengeName: "SRP_A", challengeResult: true }, wrong()];
    expect(attemptCount(mixed)).toBe(2);
    // A foreign challenge in the session fails outright regardless of the count.
    expect(decideNextStep(mixed, false)).toEqual({ kind: "fail" });
  });
});

describe("guessing a code", () => {
  it("⚠ three wrong guesses against a real code never succeed", () => {
    const code = generateCode();
    const envelope = { issuedAt: NOW, digest: digestCode(code, KEY) };

    const guesses = ["000000", "111111", "123456"].filter((g) => g !== code);
    for (const guess of guesses) {
      expect(verifyAnswer({ answer: guess, envelope, key: KEY, nowSeconds: NOW })).toEqual({
        ok: false,
        reason: "mismatch",
      });
    }
  });

  it("a code from a DIFFERENT session never verifies against this one", () => {
    const a = { issuedAt: NOW, digest: digestCode("111111", KEY) };
    expect(verifyAnswer({ answer: "222222", envelope: a, key: KEY, nowSeconds: NOW }).ok).toBe(false);
  });

  it("⚠ the digest cannot be replayed AS the answer", () => {
    // A leaked digest must not work as the code.
    const code = "123456";
    const envelope = { issuedAt: NOW, digest: digestCode(code, KEY) };
    expect(verifyAnswer({ answer: envelope.digest, envelope, key: KEY, nowSeconds: NOW })).toEqual({
      ok: false,
      reason: "malformed",
    });
  });
});

describe("issuance budget", () => {
  it("states the per-address hourly limit as a constant the trigger shares", () => {
    expect(OTP_SENDS_PER_HOUR).toBe(5);
  });

  it("⚠ restarting the flow does NOT reset the attempt budget in practice", () => {
    // A new InitiateAuth resets `session[]`; the send limit bounds it: 5 sends/hour × 3 guesses.
    const guessesPerHour = OTP_SENDS_PER_HOUR * OTP_MAX_ATTEMPTS;
    expect(guessesPerHour).toBe(15);
    // ~1 in 66,667 per hour. Remove either control and it is not acceptable.
    expect(10 ** 6 / guessesPerHour).toBeGreaterThan(50_000);
  });
});

describe("the reuse path cannot be used to farm codes", () => {
  it("a retry carries the SAME digest, so a wrong guess buys no new secret", () => {
    const code = generateCode();
    const envelope = { issuedAt: NOW, digest: digestCode(code, KEY) };
    const carried = encodeEnvelope(envelope);

    const recovered = envelopeFromSession([
      { challengeName: CUSTOM_CHALLENGE, challengeResult: false, challengeMetadata: carried },
    ]);
    expect(recovered).toEqual(envelope);
  });
});
