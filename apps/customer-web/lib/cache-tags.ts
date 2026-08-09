/**
 * Cache tags, named once (042).
 *
 * ⚠ A TAG IS A CONTRACT BETWEEN TWO FILES THAT NEVER IMPORT EACH OTHER: whatever tags the read is
 * whatever the revalidation route must invalidate, and they agree only because the strings match.
 * A typo in either place fails silently and identically to the feature working — the operator
 * publishes, gets a success, and shoppers keep seeing the old page until the revalidate interval
 * expires up to an hour later. Nothing throws, nothing logs, nothing is red.
 *
 * That is exactly the failure mode a shared constant removes.
 */

/** The published home page structure. Invalidated by a publish or a revert. */
export const HOME_LAYOUT_TAG = "home-layout"
