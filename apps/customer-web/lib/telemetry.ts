"use client"

import type { PostHog } from "posthog-js"
import type { CredentialRoute, ProductSort } from "@effy/shared-types"

/** Which auth journey an `auth_*` event belongs to. */
type AuthFlow = "sign_in" | "sign_up" | "reset"

/**
 * What the platform can HONESTLY say about a refused code (036 FR-011, R10).
 *
 * ⚠ `code_mismatch` / `code_expired` / `limit_exceeded` are permitted ONLY on `sign_up` and `reset`,
 * which run Cognito's MANAGED flow and emit real, distinguishable exceptions. On `sign_in` — the
 * platform's own custom challenge — a wrong code, an expired one, a superseded one and one that was
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

import { posthogConfig } from "@/lib/config"

/**
 * Product analytics for the storefront (constitution Principle VII).
 *
 * TWO RULES, and they matter more here than on any surface built so far — because for the
 * first time the people being measured are members of the public, not Effy employees.
 *
 *  1. CONSENT FIRST. No analytics network call may fire before the customer consents. This is
 *     not a cookie banner bolted on at the end; `init()` is simply not called until consent
 *     exists. A pleasant side effect: for a guest who never consents, the analytics SDK never
 *     loads at all, so it costs the critical path nothing.
 *
 *  2. NO PII. The only identifier we ever attach is the auth subject id (`sub`) — an opaque
 *     UUID. The customer's EMAIL IS NEVER A PROPERTY, never an identifier, never in an event
 *     payload. If you are about to type `email` into a capture call, stop.
 *
 * ⚠ RULE 1 WAS DOCUMENTED BUT NOT IMPLEMENTED until 2026-07-27 (feature 025, T020).
 *
 * This file used to open with `import posthog from "posthog-js"`. A STATIC import is resolved at
 * build time and bundled unconditionally — so the "pleasant side effect" above was simply false:
 * every guest downloaded the full SDK whether or not they ever consented, and consent gated only
 * whether it was *called*.
 *
 * It cost **67.9 KB gzipped on /product/[id]** — the single most important guest route on the
 * storefront — and it went unnoticed for two features because the bundle gate only watched `/`
 * and `/browse`. The product page was never measured. (Both were fixed together: the gate now
 * covers all five guest routes.)
 *
 * The import is now DYNAMIC and lives inside `initAnalytics()`, which already returns early
 * unless consent has been granted. The SDK therefore enters the network only for a customer who
 * has said yes — which is what the paragraph above always claimed. Every exported function keeps
 * its original synchronous signature; callers are unchanged.
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
  // not, there is nothing running and nothing to stop — which is the desired end state anyway.
  else ph?.opt_out_capturing()
}

let started = false
let loading: Promise<void> | null = null

/**
 * Idempotent. Does nothing at all unless consent has been granted.
 *
 * Fire-and-forget: the SDK is fetched asynchronously, so `started` flips a moment after this
 * returns. Events captured in that window are dropped — exactly as they already were before
 * consent existed, so no caller's behaviour changes.
 */
export function initAnalytics() {
  if (started || loading || typeof window === "undefined") return
  if (getConsent() !== "granted") return

  const { key, host } = posthogConfig()
  if (!key) return

  // DYNAMIC import — this is the line that keeps ~68 KB off the guest critical path. Do not
  // hoist it back to the top of the file; see the RULE 1 note in the module comment.
  loading = import("posthog-js")
    .then(({ default: posthog }) => {
      posthog.init(key, {
        api_host: host,
        capture_pageview: true,
        // Never fingerprint or record inputs on a public storefront.
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

/** The typed event taxonomy. Adding an event means adding it HERE, not inlining a string. */
export type StorefrontEvent =
  | { name: "storefront_viewed"; props?: Record<string, never> }
  | { name: "sign_up_started"; props: { route: CredentialRoute } }
  | { name: "sign_up_completed"; props: { route: CredentialRoute } }
  | { name: "sign_in_completed"; props: { route: CredentialRoute } }
  | { name: "deferred_sign_in_prompted"; props: { intent: string } }
  | { name: "deferred_sign_in_resumed"; props: { route: CredentialRoute } }
  | { name: "sign_in_declined"; props?: Record<string, never> }
  | { name: "account_linked"; props: { provider: "google" } }

  // ── 036: the stepped auth flow ────────────────────────────────────────────────────────────────
  //
  // ⚠ EVERY VALUE HERE IS SOMETHING THE PLATFORM CAN ACTUALLY KNOW. Note what is ABSENT from
  // `outcome`: there is no `expired`, no `superseded` and no `not_sent` on the sign-in route, because
  // the platform genuinely cannot distinguish them — `VerifyAuthChallenge` computes a reason and
  // DISCARDS it so the response cannot be used to tell whether an account exists. Inventing those
  // values would put a fiction into the analytics and then into a product decision.
  | { name: "auth_flow_started"; props: { flow: AuthFlow; entry: "deliberate" | "demanded" } }
  | { name: "auth_route_chosen"; props: { flow: AuthFlow; route: CredentialRoute } }
  | {
      name: "auth_code_requested"
      props: { flow: AuthFlow; sendOrdinal: number; trigger: "initial" | "resend" }
    }
  /** ⚠ The highest-value number in this taxonomy — see the note on `AuthCodeOutcome`. */
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
  | { name: "auth_name_step_abandoned"; props: { route: CredentialRoute } }
  // 019 commerce funnel (shared taxonomy — customer-mobile adopts these SAME names when its telemetry
  // lands; NO PII, product ids only). discover → product → cart → checkout → order.
  | { name: "product_viewed"; props: { productId: string } }
  | { name: "product_added_to_cart"; props: { productId: string; quantity: number } }
  | { name: "cart_viewed"; props?: Record<string, never> }
  | { name: "checkout_started"; props?: Record<string, never> }
  | { name: "order_placed"; props: { orderId: string } }
  | { name: "search_performed"; props?: Record<string, never> }
  // 022 address book. ⚠ NO PII — an address is PII (FR-019, SC-008), so these carry NO address
  // fields at all, only the subject id already attached by `identifyCustomer`. Props is deliberately
  // the empty object type so the compiler REFUSES any attempt to attach an address property here.
  | { name: "address_added"; props?: Record<string, never> }
  | { name: "address_edited"; props?: Record<string, never> }
  | { name: "address_deleted"; props?: Record<string, never> }
  | { name: "address_default_set"; props?: Record<string, never> }
  | { name: "address_delete_default_blocked"; props?: Record<string, never> }
  // 023 checkout shipping & billing. Same PII rule as the address book — an address is PII (SC-009),
  // so these carry NO address fields at all (not an id, not a label), only the subject id already
  // attached by `identifyCustomer`. The empty-object props type makes the compiler REFUSE any address
  // property here.
  | { name: "checkout_address_changed"; props?: Record<string, never> }
  | { name: "checkout_address_added"; props?: Record<string, never> }
  | { name: "checkout_billing_diverged"; props?: Record<string, never> }
  // 025 customer experience refresh.
  //
  // ⚠ `delivery_location_set` carries the ANSWER, never the postcode. A postcode is location data
  // about an individual, and Principle VII permits no PII in telemetry beyond the auth subject id.
  // The boolean answers the only product question worth asking here — what share of interested
  // visitors are outside a serviced zone — without identifying where anyone lives. The props type is
  // closed, so attaching a postcode is a COMPILE ERROR rather than a review catch.
  | { name: "delivery_location_set"; props: { serviced: boolean } }
  | { name: "browse_category_opened"; props: { categoryKey: string } }
  // Facet KEYS only, never their values: a search query is shopper-entered free text and can contain
  // anything at all, including things a person would not expect to be recorded.
  | { name: "search_refined"; props: { facets: string[] } }
  | { name: "search_sorted"; props: { sort: ProductSort } }
  | { name: "product_gallery_viewed"; props: { productId: string } }
  | { name: "related_product_opened"; props: { productId: string } }
  // 027 cart sync & promotions. Product ids only, as with the rest of the commerce funnel.
  //
  // ⚠ `promo_code_refused` carries the REASON, and the reason is the whole point of the event: eight
  // refusals mean eight different things a shopper could do next (FR-043), and only the distribution
  // says which of them the platform is actually inflicting on people. `promo_code_applied` carries the
  // code because an operator-created code is not personal data — it is the campaign being measured.
  | { name: "product_removed_from_cart"; props: { productId: string } }
  | { name: "promo_code_applied"; props: { code: string } }
  | { name: "promo_code_refused"; props: { reason: string } }
  // ── 039 home redesign: ONE event, and read the warning before adding a second ─────────────────
  //
  // ⚠ THE OUTCOME, NEVER THE ADDRESS. A newsletter subscriber's email is PII and is not a customer
  // account, so it is not even the subject id — it is nothing this taxonomy may carry. The props type
  // is a closed three-value enum, so attaching an email is a COMPILE ERROR rather than a review catch.
  // `already` is deliberately NOT a value: the platform does not distinguish an already-known address
  // from a new one anywhere, including here, because a distinct outcome would rebuild in analytics the
  // enumeration oracle FR-032 removes from the response.
  | { name: "newsletter_submitted"; props: { outcome: "ok" | "invalid" | "error" } }

// ⚠⚠ NOTHING IN THIS FILE CAPTURES ANYTHING TODAY, AND 039 DID NOT CHANGE THAT ⚠⚠
//
// `initAnalytics()` returns early unless consent has been granted, and `setConsent()` is the only
// thing that grants it. Neither is called ANYWHERE in this application except its own unit test —
// there is no consent banner, no settings toggle, no call on load. So `started` is never true, and
// `capture()` has returned early on every call since this surface was built (CLAUDE.md §033).
//
// This is recorded here, at the taxonomy, because it is invisible at the call sites: adding an event
// and "wiring it up" looks like a completed measurement and produces a permanent silence. 039 declared
// five events in its plan and dropped four of them for exactly this reason — the fifth is kept because
// the typed key is the right SSOT for whenever consent lands, not because it will be measured now.
//
// ⚠ AND THIS MODULE IS `"use client"`. A Server Action importing `capture()` would compile and do
// nothing twice over — once for the missing consent, once because `getConsent()` returns "unknown" off
// the browser. The newsletter's real signal is the BACKEND STRUCTURED LOG in the edge service, which
// runs regardless. Initialising PostHog on this surface is 033's open carry-forward and its own slice.

export function capture(event: StorefrontEvent) {
  if (!started || !ph || getConsent() !== "granted") return
  ph.capture(event.name, event.props)
}

/**
 * The loaded SDK, for the ONE caller that legitimately needs it directly: web-vitals, which
 * reports performance metrics rather than product events and deliberately does not go through
 * the `StorefrontEvent` taxonomy. Returns null until a consenting customer has loaded it.
 */
export function analytics(): PostHog | null {
  return started ? ph : null
}

/**
 * Associate events with the authenticated customer.
 *
 * `sub` ONLY. Passing an email here would put PII into telemetry and violate Principle VII.
 */
export function identifyCustomer(sub: string) {
  if (!started || !ph || getConsent() !== "granted") return
  ph.identify(sub)
}

export function resetIdentity() {
  if (!started || !ph) return
  ph.reset()
}
