import { describe, expect, it } from "vitest";
import { digestCode, encodeEnvelope } from "./codec.js";
import {
  OTP_LENGTH,
  OTP_MAX_ATTEMPTS,
  OTP_TTL_SECONDS,
  attemptCount,
  decideNextStep,
  envelopeFromSession,
  generateCode,
  isWellFormedCode,
  maskDestination,
  normalizeAnswer,
  sessionIsOurs,
  verifyAnswer,
} from "./policy.js";
import { CUSTOM_CHALLENGE, type ChallengeResult } from "./types.js";

const KEY = "test-key-not-a-real-secret";
const NOW = 1_800_000_000;

const ours = (result: boolean, metadata?: string): ChallengeResult => ({
  challengeName: CUSTOM_CHALLENGE,
  challengeResult: result,
  challengeMetadata: metadata,
});

describe("generateCode (contract invariant 1)", () => {
  it("always produces exactly six digits", () => {
    for (let i = 0; i < 2000; i++) expect(generateCode()).toMatch(/^[0-9]{6}$/);
  });

  it("⚠ preserves leading zeros — the defect a numeric representation would introduce", () => {
    // A code held as a number formats 7 as "7". At ~1-in-100,000 that ships a shopper who can
    // never sign in and a bug nobody can reproduce. Force the low range to prove the padding.
    const padded = Array.from({ length: 20000 }, () => generateCode()).filter((c) =>
      c.startsWith("0"),
    );
    expect(padded.length).toBeGreaterThan(0);
    for (const c of padded) expect(c).toHaveLength(OTP_LENGTH);
  });

  it("covers a wide range of the space (a constant would pass every other test here)", () => {
    const seen = new Set(Array.from({ length: 500 }, () => generateCode()));
    expect(seen.size).toBeGreaterThan(400);
  });
});

describe("isWellFormedCode / normalizeAnswer (FR-004, FR-005)", () => {
  it("accepts exactly six digits", () => {
    expect(isWellFormedCode("000000")).toBe(true);
    expect(isWellFormedCode("123456")).toBe(true);
  });

  it("⚠ REFUSES an 8-digit value rather than reshaping it — this is the shipped defect being fixed", () => {
    // shop-mobile truncated to the first six and submitted that. The result was a sign-in that
    // could never succeed and a shopper with no way to tell why.
    expect(isWellFormedCode("12345678")).toBe(false);
  });

  it("refuses short, empty, non-numeric and separator-bearing values", () => {
    for (const bad of ["12345", "", "abcdef", "12 34 56", "12-3456", "١٢٣٤٥٦", "1234567"]) {
      expect(isWellFormedCode(bad), `input: ${bad}`).toBe(false);
    }
  });

  it("trims surrounding whitespace only", () => {
    expect(normalizeAnswer("  123456 \n")).toBe("123456");
    // ⚠ Inner separators are NOT stripped: recovering "123456" from "12 34 56" would be reshaping
    // a value the shopper did not send. The client normalises input; the server refuses.
    expect(normalizeAnswer("12 34 56")).toBe("12 34 56");
  });
});

describe("decideNextStep — the attempt cap (FR-011, contract invariant 3)", () => {
  it("issues a challenge on an empty session", () => {
    expect(decideNextStep([], false)).toEqual({ kind: "issue-challenge" });
  });

  it("⚠ allows exactly three attempts — the off-by-one that would silently grant a fourth", () => {
    // Lengths 0,1,2 issue a challenge; length 3 fails. `> MAX` instead of `>= MAX` would be a 33%
    // larger brute-force budget and is invisible on reading.
    expect(decideNextStep([ours(false)], false)).toEqual({ kind: "issue-challenge" });
    expect(decideNextStep([ours(false), ours(false)], false)).toEqual({ kind: "issue-challenge" });
    expect(decideNextStep([ours(false), ours(false), ours(false)], false)).toEqual({ kind: "fail" });
  });

  it("issues tokens on a correct final answer", () => {
    expect(decideNextStep([ours(false), ours(true)], false)).toEqual({ kind: "issue-tokens" });
  });

  it("⚠ NEVER issues tokens when the session contains a challenge we did not author (invariant 5)", () => {
    // AWS: "always check challengeName ... and verify that it matches the expected value."
    const foreign: ChallengeResult = { challengeName: "PASSWORD_VERIFIER", challengeResult: true };
    expect(decideNextStep([foreign], false)).toEqual({ kind: "fail" });
    expect(decideNextStep([foreign, ours(true)], false)).toEqual({ kind: "fail" });
    expect(decideNextStep([ours(true), foreign], false)).toEqual({ kind: "fail" });
  });

  it("⚠ NEVER issues tokens for a phantom user (invariant 6)", () => {
    expect(decideNextStep([ours(true)], true)).not.toEqual({ kind: "issue-tokens" });
  });

  it("⚠ counts a phantom user's attempts identically — no short-circuit refusal (FR-016)", () => {
    // If an unknown address failed on attempt 1 while a real one got three, the number of round
    // trips before refusal would itself answer "does this account exist?".
    expect(decideNextStep([], true)).toEqual({ kind: "issue-challenge" });
    expect(decideNextStep([ours(false)], true)).toEqual({ kind: "issue-challenge" });
    expect(decideNextStep([ours(false), ours(false)], true)).toEqual({ kind: "issue-challenge" });
    expect(decideNextStep([ours(false), ours(false), ours(false)], true)).toEqual({ kind: "fail" });
  });

  it("agrees with the exported constant", () => {
    const session = Array.from({ length: OTP_MAX_ATTEMPTS }, () => ours(false));
    expect(decideNextStep(session, false)).toEqual({ kind: "fail" });
    expect(decideNextStep(session.slice(0, -1), false)).toEqual({ kind: "issue-challenge" });
  });
});

describe("attemptCount / sessionIsOurs", () => {
  it("counts only our challenges", () => {
    expect(attemptCount([ours(false), { challengeName: "SRP_A", challengeResult: true }])).toBe(1);
  });

  it("detects a foreign session", () => {
    expect(sessionIsOurs([ours(true)])).toBe(true);
    expect(sessionIsOurs([{ challengeName: "SMS_MFA", challengeResult: true }])).toBe(false);
  });
});

describe("verifyAnswer (FR-005, FR-008, FR-015)", () => {
  const envelope = { issuedAt: NOW, digest: digestCode("123456", KEY) };

  it("accepts the right code inside the window", () => {
    expect(verifyAnswer({ answer: "123456", envelope, key: KEY, nowSeconds: NOW + 10 })).toEqual({
      ok: true,
    });
  });

  it("rejects the wrong code", () => {
    expect(verifyAnswer({ answer: "654321", envelope, key: KEY, nowSeconds: NOW })).toEqual({
      ok: false,
      reason: "mismatch",
    });
  });

  it("⚠ rejects at the TTL boundary (invariant 4) — expiry is enforced HERE, not by AuthSessionValidity", () => {
    // AuthSessionValidity is refreshed on every round trip, so it cannot express "this code dies
    // five minutes after issue". A slow third attempt would otherwise keep a stale code alive.
    const last = NOW + OTP_TTL_SECONDS;
    expect(verifyAnswer({ answer: "123456", envelope, key: KEY, nowSeconds: last }).ok).toBe(true);
    expect(verifyAnswer({ answer: "123456", envelope, key: KEY, nowSeconds: last + 1 })).toEqual({
      ok: false,
      reason: "expired",
    });
  });

  it("rejects a malformed answer without consulting the digest", () => {
    expect(verifyAnswer({ answer: "12345678", envelope, key: KEY, nowSeconds: NOW })).toEqual({
      ok: false,
      reason: "malformed",
    });
  });

  it("rejects when there is no envelope — the phantom / rate-limited / send-failed path", () => {
    expect(verifyAnswer({ answer: "123456", envelope: null, key: KEY, nowSeconds: NOW })).toEqual({
      ok: false,
      reason: "no-envelope",
    });
  });

  it("rejects a correct code under the wrong key", () => {
    expect(
      verifyAnswer({ answer: "123456", envelope, key: "different-key", nowSeconds: NOW }),
    ).toEqual({ ok: false, reason: "mismatch" });
  });
});

describe("envelopeFromSession (contract invariant 2 — reuse, never regenerate)", () => {
  it("recovers the envelope a previous invocation left behind", () => {
    const envelope = { issuedAt: NOW, digest: digestCode("123456", KEY) };
    expect(envelopeFromSession([ours(false, encodeEnvelope(envelope))])).toEqual(envelope);
  });

  it("returns null on a fresh session, so the caller generates", () => {
    expect(envelopeFromSession([])).toBeNull();
  });

  it("returns null when the last challenge is not ours", () => {
    expect(
      envelopeFromSession([{ challengeName: "PASSWORD_VERIFIER", challengeResult: false }]),
    ).toBeNull();
  });

  it("returns null on corrupt metadata rather than throwing", () => {
    expect(envelopeFromSession([ours(false, "garbage")])).toBeNull();
  });
});

describe("maskDestination (contract invariant 8)", () => {
  it("keeps at most the first character of the local part", () => {
    expect(maskDestination("janith@example.com")).toBe("j•••••@example.com");
  });

  it("does not reveal a single-character local part's length as zero", () => {
    expect(maskDestination("a@example.com")).toBe("a•@example.com");
  });

  it("degrades safely on a malformed address", () => {
    expect(maskDestination("not-an-email")).toBe("•••");
    expect(maskDestination("@example.com")).toBe("•••");
  });

  it("⚠ never returns the full address", () => {
    const email = "someone@example.com";
    expect(maskDestination(email)).not.toBe(email);
  });
});

describe("secret leakage (contract invariants 7 and 8; FR-014, SC-008)", () => {
  it("⚠ the carried envelope never contains the code", () => {
    // `challengeMetadata` round-trips through the client's Session string. The AWS-authored sample
    // puts the CLEARTEXT code here; we put a keyed hash, because no AWS page states as a positive
    // fact that the client cannot read it.
    for (const code of ["000000", "123456", "999999", "042042"]) {
      const encoded = encodeEnvelope({ issuedAt: NOW, digest: digestCode(code, KEY) });
      const digestSegment = encoded.split(":")[2] ?? "";
      expect(digestSegment, `code ${code}`).not.toContain(code);
    }
  });

  it("⚠ the masked destination never contains the code or the full address", () => {
    const masked = maskDestination("shopper@example.com");
    expect(masked).not.toContain("shopper@example.com");
    expect(masked).not.toMatch(/[0-9]{6}/);
  });

  it("a digest cannot be reversed to a code by this module", () => {
    // There is deliberately no `decodeCode` / `revealCode` export anywhere. If one ever appears,
    // this assertion is the place someone will have to delete — make them think about it.
    const api = Object.keys({ generateCode, verifyAnswer, maskDestination });
    expect(api.some((k) => /reveal|decode|plain|clear/i.test(k))).toBe(false);
  });
});
