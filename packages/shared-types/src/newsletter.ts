/**
 * The subscribe result, uniform and non-enumerating: `ok` covers new, pending and confirmed addresses
 * alike (an `already` arm would reveal who is subscribed). `error` is a renderable, retryable failure.
 */
export type NewsletterSubscribeResult =
  | { status: "ok" }
  | { status: "invalid" }
  | { status: "error" };

/** The confirm result. `expired` covers invalid, used and expired tokens alike, so none confirms a token existed. */
export interface NewsletterConfirmResult {
  status: "confirmed" | "expired";
}
