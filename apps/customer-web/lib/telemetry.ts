"use client"

import type { PostHog } from "posthog-js"
import type { CredentialRoute, DeliveryPromise, ProductSort } from "@effy/shared-types"

/**
 * How the shopper chose to pay.
 *
 * A family, never a provider. "Klarna at 11pm by this subject id" is a record of someone's credit
 * decision; "instalments" answers the product question without it.
 */
type PaymentMethodFamily = "card" | "saved_card" | "wallet" | "pay_over_time"

/**
 * Why a payment did not complete, in effy's own words.
 *
 * Not the provider's `decline_code`. `insufficient_funds` against a subject id is a fact about that
 * person's bank balance, and an analytics store is not where it belongs. These four answer the only
 * question the platform needs - is the payment path working - and no more.
 */
type PaymentFailureReason = "declined" | "needs_action" | "network" | "unknown"

/** Which auth journey an `auth_*` event belongs to. */
type AuthFlow = "sign_in" | "sign_up" | "reset"

/**
 * What the platform can honestly say about a refused code.
 *
 * `code_mismatch` / `code_expired` / `limit_exceeded` are permitted only on `sign_up` and `reset`,
 * which run Cognito's managed flow and emit real, distinguishable exceptions. On `sign_in` - the
 * platform's own custom challenge - a wrong code, an expired one, a superseded one and one that was
 * never sent are indistinguishable by design, and only the first four values below may be used.
 */
type AuthCodeOutcome =
  | "not_accepted"
  | "attempts_spent"
  | "session_timed_out"
  | "ip_rate_limited"
  | "error"
  | "code_mismatch"
  | "code_expired"
  | "limit_exceeded"

import { posthogConfig, telemetryEnabled } from "@/lib/config"

/**
 * Product analytics for the storefront. Two rules:
 *  1. Consent first: `initAnalytics` returns unless consent is granted, and the SDK is imported
 *  dynamically inside it, so a guest who never consents never downloads it.
 *  2. No PII: the only identifier is the auth subject id (`sub`). Never an email.
 */

const CONSENT_KEY = "effy_analytics_consent"

/** The loaded SDK, or null until a consenting customer causes it to be fetched. */
let ph: PostHog | null = null

export type ConsentState = "granted" | "denied" | "unknown"

export function getConsent(): ConsentState {
  if (typeof window === "undefined") return "unknown"
  const v = window.localStorage.getItem(CONSENT_KEY)
  return v === "granted" || v === "denied" ? v : "unknown"
}

export function setConsent(state: Exclude<ConsentState, "unknown">) {
  if (typeof window === "undefined") return
  window.localStorage.setItem(CONSENT_KEY, state)
  if (state === "granted") initAnalytics()
  // Withdrawing consent only has something to opt out OF if the SDK was ever loaded. If it was
  // not, there is nothing running and nothing to stop - which is the desired end state anyway.
  else ph?.opt_out_capturing()
}

let started = false
let loading: Promise<void> | null = null

/**
 * Idempotent. Does nothing at all unless consent has been granted.
 *
 * Fire-and-forget: the SDK is fetched asynchronously, so `started` flips a moment after this
 * returns. Events captured in that window are dropped - exactly as they already were before
 * consent existed, so no caller's behaviour changes.
 */
export function initAnalytics() {
  if (started || loading || typeof window === "undefined") return
  if (!telemetryEnabled()) return // Kill switch, before any SDK loads
  if (getConsent() !== "granted") return

  const { key, host, ingestPath } = posthogConfig()
  if (!key) return

  // Dynamic import - this is the line that keeps ~68 KB off the guest critical path. Do not
  // hoist it back to the top of the file; see the rule 1 note in the module comment.
  loading = import("posthog-js")
    .then(({ default: posthog }) => {
      posthog.init(key, {
        // Send through our own origin (next.config.ts rewrites it), so blockers can't
        // drop it; the real host stays as ui_host for the sdk's toolbar links.
        api_host: ingestPath,
        ui_host: host,
        capture_pageview: true,
        // Never fingerprint or record inputs on a public storefront. Session replay off.
        autocapture: false,
        disable_session_recording: true,
        persistence: "localStorage",
      })
      ph = posthog
      started = true
    })
    .catch(() => {
      // Analytics must never break the storefront. A failed SDK fetch leaves `started` false,
      // so every capture below is a no-op.
    })
    .finally(() => {
      loading = null
    })
}

/** The typed event taxonomy. Adding an event means adding it here, not inlining a string. */
export type StorefrontEvent =
  | { name: "storefront_viewed"; props?: Record<string, never> }
  | { name: "sign_up_started"; props: { route: CredentialRoute } }
  | { name: "sign_up_completed"; props: { route: CredentialRoute } }
  | { name: "sign_in_completed"; props: { route: CredentialRoute } }
  | { name: "deferred_sign_in_prompted"; props: { intent: string } }
  | { name: "deferred_sign_in_resumed"; props: { route: CredentialRoute } }
  | { name: "sign_in_declined"; props?: Record<string, never> }
  | { name: "account_linked"; props: { provider: "google" } }

  // The auth flow. `outcome` has no `expired`, `superseded` or `not_sent` on sign-in: the platform
  // cannot tell them apart (VerifyAuthChallenge discards the reason so no response reveals whether an
  // account exists).
  | { name: "auth_flow_started"; props: { flow: AuthFlow; entry: "deliberate" | "demanded" } }
  | { name: "auth_route_chosen"; props: { flow: AuthFlow; route: CredentialRoute } }
  | {
    name: "auth_code_requested"
    props: { flow: AuthFlow; sendOrdinal: number; trigger: "initial" | "resend" }
  }
  /** The highest-value number in this taxonomy - see the note on `AuthCodeOutcome`. */
  | {
    name: "auth_code_resend_refused"
    props: { flow: AuthFlow; reason: "cooldown" | "flow_ceiling" }
  }
  | { name: "auth_code_submitted"; props: { flow: AuthFlow; attempt: number; lengthOk: boolean } }
  | { name: "auth_code_rejected"; props: { flow: AuthFlow; attempt: number; outcome: AuthCodeOutcome } }
  | { name: "auth_step_back"; props: { flow: AuthFlow; fromStep: string } }
  /** Sizes the demand for the Google slice that this feature deliberately did not build. */
  | { name: "auth_google_unavailable"; props: { flow: AuthFlow } }
  | { name: "auth_name_step_shown"; props: { route: CredentialRoute } }
  | { name: "auth_name_step_completed"; props: { route: CredentialRoute } }
  /**
   * The shopper chose to complete their profile later.
   *
   * Not an abandonment event. The account exists and the session is live; this step completes a
   * profile and never gates access. What it measures is how often the "later" route is taken, which
   * is the evidence for whether the step belongs here at all.
   */
  | { name: "auth_name_step_skipped"; props: { route: CredentialRoute } }
  /**
   * A field was refused before anything was sent.
   *
   * The value is never carried, only which field and which rule. The value is an email address
   * PII, and on this screen it is PII belonging to someone who is not yet authenticated (Principle
   * VII: no PII in telemetry beyond the auth subject id).
   */
  | {
    name: "auth_validation_failed"
    props: { flow: "sign_in" | "sign_up" | "reset"; field: string; rule: string }
  }
  | { name: "auth_name_step_abandoned"; props: { route: CredentialRoute } }
  // Commerce funnel (shared taxonomy - customer-mobile adopts these same names when its telemetry
  // lands; no PII, product ids only). discover → product → cart → checkout → order.
  | { name: "product_viewed"; props: { productId: string } }
  | { name: "product_added_to_cart"; props: { productId: string; quantity: number; variantId?: string } }
  /** A size chosen on the product page (ids only). */
  | { name: "variant_selected"; props: { productId: string; variantId: string } }
  // A listing filter applied (101): which facet, and whether it was a choice or a number range. No values.
  | { name: "filter_applied"; props: { facet: string; kind: "choice" | "range" } }
  | { name: "cart_viewed"; props?: Record<string, never> }
  | { name: "checkout_started"; props?: Record<string, never> }
  | { name: "order_placed"; props: { orderId: string } }
  /**
   * The receipt. `stage` is the customer-facing word, and there is deliberately no amount, no
   * address and no email here: the taxonomy's standing rule is no PII beyond the auth subject id, and
   * Records a payment family rather than a provider decline code for the same reason.
   */
  | { name: "receipt_viewed"; props: { surface: "checkout" | "history"; stage: string } }
  | { name: "receipt_resend_requested"; props?: Record<string, never> }
  /** The order's documents. Which document, never its contents or number. */
  | { name: "delivery_note_viewed"; props?: Record<string, never> }
  | { name: "tax_invoice_downloaded"; props: { kind: "invoice" | "adjustment" } }
  /** Why a resend was refused - Effy's own vocabulary, never the transport's. */
  | {
    name: "receipt_resend_refused"
    props: { reason: "rate_limited" | "unavailable" | "failed" }
  }
  | { name: "search_performed"; props?: Record<string, never> }
  /** A line of the search field's list was chosen. The kind of line, never its text. */
  | { name: "search_suggestion_selected"; props: { kind: "phrase" | "aisle" | "product" | "recent" } }
  // Customer points. No amounts, no balance - a points balance is account data, not behaviour.
  | { name: "points_viewed"; props?: Record<string, never> }
  | { name: "checkout_points_toggled"; props: { on: boolean } }
  | { name: "checkout_paid_with_points"; props: { share: "part" | "all" } }
  // Address book. No PII - an address is PII, so these carry NO address
  // fields at all, only the subject id already attached by `identifyCustomer`. Props is deliberately
  // the empty object type so the compiler refuses any attempt to attach an address property here.
  | { name: "address_added"; props?: Record<string, never> }
  | { name: "address_edited"; props?: Record<string, never> }
  | { name: "address_deleted"; props?: Record<string, never> }
  | { name: "address_default_set"; props?: Record<string, never> }
  | { name: "address_delete_default_blocked"; props?: Record<string, never> }
  // Checkout shipping & billing. Same PII rule as the address book - an address is PII,
  // so these carry NO address fields at all (not an id, not a label), only the subject id already
  // attached by `identifyCustomer`. The empty-object props type makes the compiler refuse any address
  // property here.
  | { name: "checkout_address_changed"; props?: Record<string, never> }
  | { name: "checkout_address_added"; props?: Record<string, never> }
  | { name: "checkout_billing_diverged"; props?: Record<string, never> }
  // Delivery instructions.
  //
  // Never the note, its length, or the address. The note is customer-authored and may hold a gate
  // code; the type below admits a closed enum and two booleans and nothing else, so a call site that
  // tries to attach the text does not compile.
  | {
    name: "checkout_delivery_instructions_set"
    props: { handover: "leave_at_door" | "meet_at_door" | "none"; hasNote: boolean; fromSavedDefault: boolean }
  }
  // Delivery slots and dates.
  //
  // Counts and offsets, never a time or an address. "The third of four slots, six hours ahead" says
  // which slots people want; the slot's clock time joined to a session would say when a household is
  // home. `position` is 1-based among the options shown.
  | { name: "checkout_delivery_slot_selected"; props: { slotsOffered: number; position: number; hoursAhead: number } }
  | { name: "checkout_delivery_date_selected"; props: { daysAhead: number; wasDefault: boolean } }
  | {
    name: "checkout_delivery_choice_refused"
    props: { reason: "slot_unavailable" | "date_unavailable" | "slot_required" | "no_windows_available" }
  }
  // Delivery windows (the new delivery model).
  //
  // Which section and how many days ahead - never the window's id or its clock time (the same
  // reason as the slot event above). `reason` is why nothing could be chosen.
  // An "as soon as possible" order's day_offset is -1: the customer chose no day.
  | { name: "checkout_window_selected"; props: { section: "same_day" | "standard"; day_offset: number; promise: DeliveryPromise } }
  | { name: "checkout_windows_unavailable"; props: { reason: "no_windows" | "none_defined" } }
  // Who delivers.
  //
  // The type and why, and nothing else - never a postcode, an address or the estimate. `reason` is
  // which of three situations the shopper is in; it says how often an address falls outside Effy's
  // area and how often the windows run out, not where anyone lives.
  | { name: "checkout_delivery_type_shown"; props: { type: "effy" | "courier"; reason: "in_coverage" | "out_of_coverage" | "no_window" } }
  | { name: "checkout_delivery_type_changed"; props: Record<string, never> }
  // Delivery fee.
  //
  // Three booleans and nothing else - never an amount. Whether free delivery, the small-order fee
  // or a window surcharge appeared says how the business's pricing lands; a fee joined to a session
  // says how far from the hub someone lives.
  | { name: "delivery_fee_viewed"; props: { free: boolean; small_order: boolean; surcharge: boolean } }
  | { name: "checkout_delivery_fee_changed"; props: Record<string, never> }
  // An offer changed between the cart and the pay button.
  | { name: "checkout_promotions_changed"; props: Record<string, never> }
  // Payment. Never a card number (not even the last four), security code, payment-method id, provider
  // customer id or amount. `method` is a family, not a provider.
  | { name: "payment_method_selected"; props: { method: PaymentMethodFamily } }
  | { name: "payment_succeeded"; props: { method: PaymentMethodFamily } }
  // `reason` is effy's own vocabulary, never the provider's `decline_code`. A raw code would be a
  // fact about the shopper's bank relationship sitting in an analytics store; the coarse reason
  // answers "is our payment path broken" without holding that.
  | { name: "payment_failed"; props: { method: PaymentMethodFamily; reason: PaymentFailureReason } }
  | { name: "payment_abandoned_at_provider"; props: { method: PaymentMethodFamily } }
  | { name: "saved_card_used"; props?: Record<string, never> }
  | { name: "card_saved"; props?: Record<string, never> }
  | { name: "card_removed"; props: { from: "checkout" | "account" } }
  // Customer experience refresh.
  //
  // `delivery_location_set` carries the answer, never the postcode. A postcode is location data
  // about an individual, and Principle VII permits no PII in telemetry beyond the auth subject id.
  // The boolean answers the only product question worth asking here - what share of interested
  // visitors are outside a serviced zone - without identifying where anyone lives. The props type is
  // closed, so attaching a postcode is a compile error rather than a review catch.
  | { name: "delivery_location_set"; props: { serviced: boolean } }
  | { name: "browse_category_opened"; props: { categoryKey: string } }
  // Facet keys only, never their values: a search query is shopper-entered free text and can contain
  // anything at all, including things a person would not expect to be recorded.
  | { name: "search_refined"; props: { facets: string[] } }
  | { name: "search_sorted"; props: { sort: ProductSort } }
  | { name: "product_gallery_viewed"; props: { productId: string } }
  | { name: "related_product_opened"; props: { productId: string } }
  // Cart sync & promotions. Product ids only, as with the rest of the commerce funnel.
  //
  // `promo_code_refused` carries the reason, and the reason is the whole point of the event: eight
  // refusals mean eight different things a shopper could do next, and only the distribution
  // says which of them the platform is actually inflicting on people. `promo_code_applied` carries the
  // code because an operator-created code is not personal data - it is the campaign being measured.
  | { name: "product_removed_from_cart"; props: { productId: string } }
  | { name: "promo_code_applied"; props: { code: string } }
  | { name: "promo_code_refused"; props: { reason: string } }
  // Newsletter: the outcome, never the address (a subscriber's email is PII). No `already` value: the
  // platform never distinguishes a known address from a new one.
  | { name: "newsletter_submitted"; props: { outcome: "ok" | "invalid" | "error" } }

  // Promotion skins
  //
  // Which place and which skin a promotion was opened or its code copied from, so marketing can compare
  // skins. The promotion and skin ids are platform ids, not about a person.
  | { name: "promotion_banner_tapped"; props: { promotionId: string; groupKey: string; skinId: string; layout: string; action: "open" | "copy" } }

  // Customer lists
  //
  // Never the list's name, and not its length either. A name is the shopper's own free
  // text - "Mum's chemo snacks" is a list name - and Principle VII permits no PII beyond the subject
  // id. Every props type below is closed and holds only enums, booleans and counts, so attaching a
  // name is a compile error rather than a review catch. `telemetry.test.ts` pins that.
  //
  // What they answer: do shoppers make lists; do they put things in them; and is the
  // weekly-shop action used from a named list or from "Saved".
  | { name: "saved_list_created"; props: { source: "chooser" | "lists_page"; withProduct: boolean } }
  | { name: "saved_list_entry_added"; props: { listKind: "default" | "named"; source: "chooser" | "undo" } }
  | { name: "saved_list_add_all"; props: { listKind: "default" | "named"; addedCount: number; skippedCount: number } }
  // The customer opened their courier tracking link. No URL, reference or courier name.
  | { name: "courier_tracking_opened"; props?: Record<string, never> }

  // Customer feedback
  //
  // No PII. The category, whether a rating/email was given, the source and the outcome - never the
  // message and never the address (Principle VII). Like everything in this taxonomy it is a no-op
  // until PostHog is initialised on customer-web (the 039 carry-forward).
  | {
    name: "feedback_submitted"
    props: {
      category: string
      hasRating: boolean
      hasEmail: boolean
      source: string
      outcome: "ok" | "invalid" | "rate_limited" | "error"
    }
  }

// Nothing captures today: nothing in the app calls `setConsent` (there is no consent banner), so
// `capture` always returns early. The events stay typed for when consent lands. It is `"use client"`:
// from a Server Action it would do nothing (`getConsent` is "unknown" off the browser).

export function capture(event: StorefrontEvent) {
  if (!started || !ph || getConsent() !== "granted") return
  ph.capture(event.name, event.props)
}

/**
 * The loaded SDK, for the one caller that legitimately needs it directly: web-vitals, which
 * reports performance metrics rather than product events and deliberately does not go through
 * the `StorefrontEvent` taxonomy. Returns null until a consenting customer has loaded it.
 */
export function analytics(): PostHog | null {
  return started ? ph : null
}

/**
 * Associate events with the authenticated customer.
 *
 * `sub` only. Passing an email here would put PII into telemetry and violate Principle VII.
 */
export function identifyCustomer(sub: string) {
  if (!started || !ph || getConsent() !== "granted") return
  ph.identify(sub)
}

export function resetIdentity() {
  if (!started || !ph) return
  ph.reset()
}
