import { createHmac } from "node:crypto";

import { getSecretString } from "@effy/edge-shared";

import { LayoutError } from "./types";

/**
 * Minting a preview grant (042 US3, T075).
 *
 * ⚠ THIS IS THE TYPESCRIPT HALF OF A FORMAT WHOSE OTHER HALF IS IN GO
 * (`apis/core-api/internal/features/storefront/preview.go`). That is exactly the shape 027 lost days
 * to — two languages, one wire format, unit tests on both sides that never crossed the boundary. So
 * `preview.test.ts` and `preview_test.go` pin the SAME literal signature by hand. If either drifts,
 * one of them goes red; without them, every preview link would silently fall back to published
 * content with nothing anywhere to look at.
 *
 * ⚠ WHY A TOKEN AT ALL. FR-018 requires the preview to be THE REAL PAGE — same route, same
 * components — because a parallel renderer eventually disagrees with the thing it previews, and the
 * operator trusts it right up until it is wrong. But the real page is the PUBLIC storefront, which
 * has no concept of a back-office identity. The token proves "an authorised operator asked for this"
 * without the storefront learning who they are, and without the hot path gaining a second
 * authentication scheme.
 */

/**
 * ⚠ SHORT ON PURPOSE, and matched to the Go side. The token travels in a URL — into browser history,
 * into whatever the operator pastes it into, into any proxy log along the way. Fifteen minutes is
 * long enough to review a page and short enough that a leaked link is worthless by the time anyone
 * finds it.
 */
const TTL_SECONDS = 15 * 60;

/**
 * ⚠ THE DOMAIN PREFIX IS PART OF THE SIGNED MESSAGE, not decoration. The same secret signs the
 * storefront revalidation bearer; without this, a signature over a bare payload would be
 * interchangeable between the two, and a token meant to let someone READ a draft would also let them
 * FLUSH the storefront's cache.
 */
const DOMAIN = "preview:v1:";

/** Sign a payload exactly as the hot path verifies it. Exported for the contract test. */
export function previewSignature(secret: string, payload: string): string {
  return (
    createHmac("sha256", secret)
      .update(DOMAIN + payload)
      // ⚠ base64url WITHOUT padding. Standard base64 carries `+` and `/`, which are not URL-safe and
      // would be mangled in transit — the encoding is part of the contract, not an implementation
      // detail, and the Go side asserts the same.
      .digest("base64url")
  );
}

/**
 * A short-lived grant to view the draft home page.
 *
 * ⚠ NOTHING IS STORED. There is no token table, no revocation list, no session row — the signature
 * and the expiry are the whole mechanism. That means a minted token cannot be withdrawn early, which
 * is the deliberate trade for the TTL being fifteen minutes: revocation infrastructure for something
 * that expires before anyone could realistically use it is machinery with no reader.
 */
export async function mintPreviewToken(): Promise<{ token: string; expiresAt: string }> {
  const arn = process.env.REVALIDATE_SECRET_ARN;
  if (!arn) {
    // ⚠ Loud, not silent. A preview that quietly showed PUBLISHED content would let an operator
    // review a page, see nothing wrong, and publish something they never actually looked at.
    throw new LayoutError(
      503,
      "preview_not_configured",
      "preview is not available on this environment — REVALIDATE_SECRET_ARN is not set",
    );
  }

  const secret = await getSecretString(arn);
  const expiresAt = Math.floor(Date.now() / 1000) + TTL_SECONDS;
  const payload = String(expiresAt);

  return {
    token: `${payload}.${previewSignature(secret, payload)}`,
    expiresAt: new Date(expiresAt * 1000).toISOString(),
  };
}
