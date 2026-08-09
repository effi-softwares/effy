import { createHmac } from "node:crypto";

import { describe, expect, it } from "vitest";

import { previewSignature } from "./preview";

/**
 * ⚠ THE CROSS-LANGUAGE CONTRACT (042 US3).
 *
 * The back office mints preview tokens in TypeScript; `core-api` verifies them in Go. That is the
 * exact shape 027 lost days to — two languages, one wire format, and unit tests on both sides that
 * never crossed the boundary, every one of them passing while the wire carried something neither
 * side could read.
 *
 * So the bytes are pinned. This literal is duplicated, deliberately and by hand, in
 * `apis/core-api/internal/features/storefront/preview_test.go`. Neither side generates it.
 *
 * ⚠ THE FAILURE THIS PREVENTS IS SILENT BY CONSTRUCTION. An unverifiable token does not error — the
 * hot path falls through to published content on purpose, so an anonymous prober learns nothing.
 * Which means a format drift would present as "preview shows the live page": no error, no log,
 * nothing to look at. An operator would review a page, see nothing wrong, and publish something they
 * never actually looked at.
 */
const WIRE_SECRET = "effy-preview-contract-test-key";
const WIRE_PAYLOAD = "1893456000";
const WIRE_SIGNATURE = "kuZPS42r2ap-5A3ZfPOieKCxV7sBlsU6jphidbpud1U";

describe("the preview signature is byte-identical to the hot path's", () => {
  it("produces the pinned signature", () => {
    expect(previewSignature(WIRE_SECRET, WIRE_PAYLOAD)).toBe(WIRE_SIGNATURE);
  });

  it("is base64url without padding — the encoding is part of the contract", () => {
    // Standard base64 carries `+` and `/`, which are not URL-safe and would be mangled in transit.
    const sig = previewSignature(WIRE_SECRET, WIRE_PAYLOAD);
    expect(sig).toHaveLength(43);
    expect(sig).not.toMatch(/[+/=]/);
  });

  it("binds the signature to its purpose, so one secret is not two capabilities", () => {
    // ⚠ The same key signs the storefront revalidation bearer. Without the `preview:v1:` prefix
    // inside the MAC, a token meant to let someone READ a draft would also let them FLUSH the cache.
    const undomained = createHmac("sha256", WIRE_SECRET).update(WIRE_PAYLOAD).digest("base64url");
    expect(previewSignature(WIRE_SECRET, WIRE_PAYLOAD)).not.toBe(undomained);
  });

  it("changes completely when the payload changes by one second", () => {
    // Guards against an implementation that signs a constant and ignores its input — which would
    // pass a naive round-trip test and make every token interchangeable with every other.
    expect(previewSignature(WIRE_SECRET, "1893456001")).not.toBe(WIRE_SIGNATURE);
  });

  it("changes completely when the secret changes", () => {
    expect(previewSignature("another-key", WIRE_PAYLOAD)).not.toBe(WIRE_SIGNATURE);
  });
});
