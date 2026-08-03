import { describe, expect, it } from "vitest";
import { decodeEnvelope, digestCode, digestsMatch, encodeEnvelope } from "./codec.js";

const KEY = "test-key-not-a-real-secret";

describe("encodeEnvelope / decodeEnvelope", () => {
  it("round-trips", () => {
    const envelope = { issuedAt: 1_800_000_000, digest: digestCode("123456", KEY) };
    expect(decodeEnvelope(encodeEnvelope(envelope))).toEqual(envelope);
  });

  it("⚠ NEVER carries the code in cleartext — the whole reason we diverge from the AWS sample", () => {
    // aws-samples writes `CODE-123456` here. That string round-trips through the client's Session,
    // and no AWS page states positively that it is withheld from the client.
    //
    // ⚠ NOTE ON HOW THIS IS ASSERTED. The guarantee is STRUCTURAL — the payload is a fixed-width
    // hash, so there is nowhere for a code to hide — and the test is written that way on purpose.
    // A "the digest contains no six consecutive digits" check would be worse than useless: hex
    // includes 0-9, so a 64-char digest contains such a run about 3.5 times over and the
    // assertion fails on almost every input. A security test that cries wolf is one people learn
    // to ignore.
    const code = "123456";
    const encoded = encodeEnvelope({ issuedAt: 1_800_000_000, digest: digestCode(code, KEY) });

    expect(encoded).not.toContain(code);
    // Exactly three fields, the third a 64-char hex digest and nothing else.
    expect(encoded).toMatch(/^v1:[0-9]+:[0-9a-f]{64}$/);
  });

  it("⚠ does not leak the code for a sample of real codes either", () => {
    // ⚠ SCOPED TO THE DIGEST SEGMENT, and that is not pedantry. Asserting over the whole envelope
    // fails on code "000000", because the TIMESTAMP `1800000000` contains it — a false positive
    // that says nothing about secrecy. The secret lives in the third field; that is what gets
    // checked.
    //
    // Chance of a 64-char hex digest happening to contain a given 6-digit substring is about
    // 59 * 16^-6 ≈ 3.5e-6, so 200 samples is ~7e-4 of a false red. Kept deliberately modest:
    // a 5,000-sample version would flake ~2% of CI runs, and someone would "fix" it by deleting it.
    for (let i = 0; i < 200; i++) {
      const code = String(i * 4813).padStart(6, "0").slice(-6);
      const encoded = encodeEnvelope({ issuedAt: 1_800_000_000, digest: digestCode(code, KEY) });
      const digestSegment = encoded.split(":")[2] ?? "";
      expect(digestSegment, `code ${code}`).not.toContain(code);
    }
  });

  it("rejects every malformed shape rather than throwing", () => {
    // ⚠ Returning null (not throwing) matters: a throw here would surface to the caller as
    // Cognito's `{{[trigger]}} failed with error ...` message.
    for (const bad of [
      undefined,
      "",
      "nonsense",
      "v1:123", // too few parts
      "v1:123:abc:def", // too many
      "v2:1800000000:" + "a".repeat(64), // unknown version
      "v1:notanumber:" + "a".repeat(64),
      "v1:1e9:" + "a".repeat(64), // Number() would accept this; we must not
      "v1: 1800000000 :" + "a".repeat(64), // padded
      "v1:0:" + "a".repeat(64), // zero timestamp
      "v1:-5:" + "a".repeat(64),
      "v1:1800000000:tooshort",
      "v1:1800000000:" + "A".repeat(64), // uppercase hex is not what we emit
      "v1:1800000000:" + "g".repeat(64), // not hex
    ]) {
      expect(decodeEnvelope(bad as string | undefined), `input: ${String(bad)}`).toBeNull();
    }
  });
});

describe("digestCode", () => {
  it("is stable for the same input and key", () => {
    expect(digestCode("000000", KEY)).toBe(digestCode("000000", KEY));
  });

  it("is keyed — the same code under a different key gives a different digest", () => {
    expect(digestCode("123456", KEY)).not.toBe(digestCode("123456", "another-key"));
  });

  it("distinguishes leading zeros", () => {
    // If a code were ever handled as a number, "012345" and "12345" would collide here.
    expect(digestCode("012345", KEY)).not.toBe(digestCode("12345", KEY));
  });
});

describe("digestsMatch", () => {
  it("matches identical digests", () => {
    const d = digestCode("654321", KEY);
    expect(digestsMatch(d, d)).toBe(true);
  });

  it("rejects different digests", () => {
    expect(digestsMatch(digestCode("111111", KEY), digestCode("222222", KEY))).toBe(false);
  });

  it("⚠ returns false rather than throwing on a length mismatch", () => {
    // node's timingSafeEqual THROWS on unequal lengths; an uncaught throw here would itself be an
    // oracle (and would reach the client as trigger error text).
    expect(() => digestsMatch("short", digestCode("111111", KEY))).not.toThrow();
    expect(digestsMatch("short", digestCode("111111", KEY))).toBe(false);
    expect(digestsMatch("", "")).toBe(true);
  });
});
