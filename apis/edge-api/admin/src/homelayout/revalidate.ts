// Telling the storefront its cached page structure is stale (042, FR-015a).
//
// ⚠ WITHOUT THIS CALL THE FEATURE APPEARS TO WORK AND DOES NOT — and that is the entire reason this
// file has a comment this long.
//
// The storefront reads the published structure through a cached path so the public home page can
// still prerender as a static shell. Nothing about that read notices a publish. So an operator would
// change the page, be told it succeeded, look at the storefront, and see the old page — for up to an
// hour, with no error anywhere, nothing logged, and nothing to click. The most likely thing they do
// next is publish again.
//
// ⚠ A FAILURE HERE IS SURFACED TO THE OPERATOR, NOT SWALLOWED. That is a deliberate inversion of this
// codebase's usual instinct: 038's Cognito interceptor NEVER throws, because a failure there breaks
// sign-in and the fallback is a working plain email. Here the trade runs the other way. The fallback
// is "shoppers keep seeing the old page while the console says you published", which is a lie the
// operator has no way to detect. Told about it, they can retry; not told, they cannot.
import { getSecretString } from "@effy/edge-shared";

import { LayoutError } from "./types";

/** The tag the storefront names on its cached layout read. Must match `lib/cache-tags.ts`. */
const HOME_LAYOUT_TAG = "home-layout";

/**
 * ⚠ Bounded, because this call sits on the operator's publish request. An unreachable storefront must
 * cost them a few seconds and a clear message, not a Lambda timeout with no explanation.
 */
const TIMEOUT_MS = 5_000;

export async function revalidateStorefront(): Promise<void> {
  const baseUrl = process.env.STOREFRONT_BASE_URL;
  const secretArn = process.env.REVALIDATE_SECRET_ARN;

  // ⚠ Configuration absence FAILS rather than skipping. A missing address here would otherwise mean
  // every publish silently does half its job on that environment — the failure mode is identical to
  // the feature working, which is the one shape of bug that survives indefinitely.
  if (!baseUrl || !secretArn) {
    throw new LayoutError(
      503,
      "revalidation_not_configured",
      "published, but the storefront could not be told to refresh — STOREFRONT_BASE_URL and " +
        "REVALIDATE_SECRET_ARN are not set on this environment",
    );
  }

  // ⚠ A PLAIN SECRET STRING, not the RDS JSON envelope. This is a shared bearer between two
  // deployments of the platform, generated and stored by the operator (constitution: a real-world
  // credential is asked for, never invented).
  const secret = await getSecretString(secretArn);

  let response: Response;
  try {
    response = await fetch(`${baseUrl.replace(/\/$/, "")}/api/revalidate`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-revalidate-secret": secret },
      body: JSON.stringify({ tag: HOME_LAYOUT_TAG }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    throw new LayoutError(
      502,
      "revalidation_failed",
      // ⚠ The message says PUBLISHED FIRST, because it is true and it is what the operator most needs
      // to know. The database write has already committed; this is the cache, and re-publishing is a
      // reasonable next step precisely because it is idempotent.
      `published, but the storefront did not accept the refresh (${err instanceof Error ? err.message : String(err)}) — ` +
        "shoppers may see the previous page for up to an hour; publishing again will retry",
    );
  }

  if (!response.ok) {
    throw new LayoutError(
      502,
      "revalidation_failed",
      `published, but the storefront refused the refresh (HTTP ${response.status}) — ` +
        "shoppers may see the previous page for up to an hour; publishing again will retry",
    );
  }
}
