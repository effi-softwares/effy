/**
 * Newsletter subscription (039 US6).
 *
 * Contract: `specs/039-customer-home-redesign/contracts/newsletter-api.contract.md`.
 *
 * The SSOT both the web Server Action and the `edge-customer` handlers import (Principle II). Nothing
 * here is redefined on either side.
 */

export interface NewsletterSubscribeRequest {
  email: string;
}

/**
 * The subscribe result — UNIFORM AND NON-ENUMERATING.
 *
 * ⚠ THERE IS DELIBERATELY NO `already` ARM, and that is a security property rather than an omission.
 * A visibly distinct "you're already on the list" response is a subscriber-enumeration oracle: anyone
 * could probe an address and learn whether it is subscribed. Double opt-in exists precisely to stop
 * this form being used against a third party, and an enumerable response hands part of that back.
 *
 * So `ok` covers new, already-pending and already-confirmed addresses identically (FR-032). The spec's
 * FR-033 was amended from four states to three to match, rather than the contract being loosened.
 *
 * ⚠ `error` exists because a backend failure has to be RENDERABLE. Without it FR-033's "friendly,
 * retryable error" has no value to carry and the telemetry outcome has nothing to report — the first
 * draft of this type omitted it while two tasks already depended on it.
 */
export type NewsletterSubscribeResult =
  | { status: "ok" }
  | { status: "invalid" }
  | { status: "error" };

/**
 * The confirm result.
 *
 * ⚠ `expired` covers invalid, already-used and genuinely expired tokens alike — the three are
 * deliberately indistinguishable to the caller. Telling someone "that token was already used" confirms
 * the token existed, which is a small oracle of its own.
 */
export interface NewsletterConfirmResult {
  status: "confirmed" | "expired";
}
