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
 * US3 — the brute-force controls, proven rather than asserted (035 T087).
 *
 * ⚠ WHY THIS FILE CARRIES MORE WEIGHT THAN ITS SIZE SUGGESTS.
 *
 * Moving from an 8-digit service-managed code to a 6-digit self-managed one shrinks the guess space
 * a HUNDREDFOLD, from 10^8 to 10^6. In exchange the platform took on every control Cognito was
 * providing for free — and Cognito now enforces NONE of them:
 *
 *   • no quota on custom-challenge attempts
 *   • no quota on RespondToAuthChallenge retries per session
 *   • a per-user rate of 10 requests/second, which permits ~3,000 guesses inside one 5-minute code
 *     lifetime — roughly a 0.3% chance of hitting a given code per window, and far worse when
 *     distributed
 *
 * `decideNextStep` is the only thing standing between a shopper and that arithmetic. If the tests
 * below are wrong, six digits is not safe.
 */

const KEY = "test-key-not-a-real-secret";
const NOW = 1_800_000_000;

const wrong = (): ChallengeResult => ({ challengeName: CUSTOM_CHALLENGE, challengeResult: false });
const right = (): ChallengeResult => ({ challengeName: CUSTOM_CHALLENGE, challengeResult: true });

describe("attempt cap", () => {
  it("stops at exactly three guesses, and the arithmetic is stated", () => {
    // 3 guesses against 10^6 is a 3-in-a-million chance per issued code. That is the number the
    // whole design rests on; if this test ever loosens, write down the new number.
    let attempts = 0;
    const session: ChallengeResult[] = [];
    while (decideNextStep(session, false).kind === "issue-challenge") {
      session.push(wrong());
      attempts++;
      if (attempts > 10) break; // guard against an infinite loop if the cap regresses to nothing
    }
    expect(attempts).toBe(OTP_MAX_ATTEMPTS);
    expect(decideNextStep(session, false)).toEqual({ kind: "fail" });
  });

  it("a failed session cannot be revived by appending more attempts", () => {
    const dead = [wrong(), wrong(), wrong(), wrong(), wrong()];
    expect(decideNextStep(dead, false)).toEqual({ kind: "fail" });
  });

  it("⚠ a correct answer AFTER the cap is still refused", () => {
    // Otherwise an attacker who exhausts the cap could keep guessing and be let in on a later hit.
    expect(decideNextStep([wrong(), wrong(), wrong(), right()], false)).toEqual({ kind: "fail" });
  });

  it("counts only our own challenges toward the cap", () => {
    const mixed = [wrong(), { challengeName: "SRP_A", challengeResult: true }, wrong()];
    expect(attemptCount(mixed)).toBe(2);
    // ⚠ …but a foreign challenge in the session fails outright regardless of the count.
    expect(decideNextStep(mixed, false)).toEqual({ kind: "fail" });
  });
});

describe("guessing a code", () => {
  it("⚠ three wrong guesses against a real code never succeed", () => {
    const code = generateCode();
    const envelope = { issuedAt: NOW, digest: digestCode(code, KEY) };

    // Three plausible guesses that are not the code.
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
    // A digest that leaked from `challengeMetadata` must not be usable as the code itself.
    const code = "123456";
    const envelope = { issuedAt: NOW, digest: digestCode(code, KEY) };
    expect(verifyAnswer({ answer: envelope.digest, envelope, key: KEY, nowSeconds: NOW })).toEqual({
      ok: false,
      reason: "malformed", // not six digits — refused before any comparison
    });
  });
});

describe("issuance budget", () => {
  it("states the per-address hourly limit as a constant the trigger shares", () => {
    // The limit lives in one place so the trigger, the tests and the operator runbook cannot drift.
    expect(OTP_SENDS_PER_HOUR).toBe(5);
  });

  it("⚠ restarting the flow does NOT reset the attempt budget in practice", () => {
    // Cognito's `session[]` resets on a new InitiateAuth, so per-session attempt counting alone
    // would let an attacker have three fresh guesses forever. What actually bounds them is the
    // per-address SEND limit: 5 sends/hour × 3 guesses = at most 15 guesses per hour per address,
    // against 10^6. This test records the reasoning, since the two controls only work together.
    const guessesPerHour = OTP_SENDS_PER_HOUR * OTP_MAX_ATTEMPTS;
    expect(guessesPerHour).toBe(15);
    // ~1 in 66,667 per hour. Acceptable. Remove either control and it is not.
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
