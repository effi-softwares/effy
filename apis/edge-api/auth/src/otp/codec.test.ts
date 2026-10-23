import { describe, expect, it } from "vitest";
import { decodeEnvelope, digestCode, digestsMatch, encodeEnvelope } from "./codec.js";

const KEY = "test-key-not-a-real-secret";

describe("encodeEnvelope / decodeEnvelope", () => {
  it("round-trips", () => {
    const envelope = { issuedAt: 1_800_000_000, digest: digestCode("123456", KEY) };
    expect(decodeEnvelope(encodeEnvelope(envelope))).toEqual(envelope);
  });

  it("⚠ NEVER carries the code in cleartext — the whole reason we diverge from the AWS sample", () => {
    // The guarantee is structural (a fixed-width hash), so the test checks structure, not digit runs.
    const code = "123456";
    const encoded = encodeEnvelope({ issuedAt: 1_800_000_000, digest: digestCode(code, KEY) });

    expect(encoded).not.toContain(code);
    // Exactly three fields, the third a 64-char hex digest and nothing else.
    expect(encoded).toMatch(/^v1:[0-9]+:[0-9a-f]{64}$/);
  });

  it("⚠ does not leak the code for a sample of real codes either", () => {
    // Checked on the digest segment only: the timestamp itself can contain "000000".
    for (let i = 0; i < 200; i++) {
      const code = String(i * 4813).padStart(6, "0").slice(-6);
      const encoded = encodeEnvelope({ issuedAt: 1_800_000_000, digest: digestCode(code, KEY) });
      const digestSegment = encoded.split(":")[2] ?? "";
      expect(digestSegment, `code ${code}`).not.toContain(code);
    }
  });

  it("rejects every malformed shape rather than throwing", () => {
    // Null, not a throw: Cognito would relay the error text.
    for (const bad of [
      undefined,
      "",
      "nonsense",
      "v1:123",
      "v1:123:abc:def",
      "v2:1800000000:" + "a".repeat(64),
      "v1:notanumber:" + "a".repeat(64),
      "v1:1e9:" + "a".repeat(64), // Number would accept this; we must not
      "v1: 1800000000 :" + "a".repeat(64),
      "v1:0:" + "a".repeat(64),
      "v1:-5:" + "a".repeat(64),
      "v1:1800000000:tooshort",
      "v1:1800000000:" + "A".repeat(64),
      "v1:1800000000:" + "g".repeat(64),
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
    // A code handled as a number would make "012345" and "12345" collide.
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
    // timingSafeEqual throws on unequal lengths.
    expect(() => digestsMatch("short", digestCode("111111", KEY))).not.toThrow();
    expect(digestsMatch("short", digestCode("111111", KEY))).toBe(false);
    expect(digestsMatch("", "")).toBe(true);
  });
});
