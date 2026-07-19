"use client"

import posthog from "posthog-js"
import type { CredentialRoute } from "@effy/shared-types"

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
 */

const CONSENT_KEY = "effy_analytics_consent"

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
  else posthog.opt_out_capturing()
}

let started = false

/** Idempotent. Does nothing at all unless consent has been granted. */
export function initAnalytics() {
  if (started || typeof window === "undefined") return
  if (getConsent() !== "granted") return

  const { key, host } = posthogConfig()
  if (!key) return

  posthog.init(key, {
    api_host: host,
    capture_pageview: true,
    // Never fingerprint or record inputs on a public storefront.
    autocapture: false,
    disable_session_recording: true,
    persistence: "localStorage",
  })
  started = true
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
  // 019 commerce funnel (shared taxonomy — customer-mobile adopts these SAME names when its telemetry
  // lands; NO PII, product ids only). discover → product → cart → checkout → order.
  | { name: "product_viewed"; props: { productId: string } }
  | { name: "product_added_to_cart"; props: { productId: string; quantity: number } }
  | { name: "cart_viewed"; props?: Record<string, never> }
  | { name: "checkout_started"; props?: Record<string, never> }
  | { name: "order_placed"; props: { orderId: string } }
  | { name: "product_favorited"; props: { productId: string } }
  | { name: "search_performed"; props?: Record<string, never> }

export function capture(event: StorefrontEvent) {
  if (!started || getConsent() !== "granted") return
  posthog.capture(event.name, event.props)
}

/**
 * Associate events with the authenticated customer.
 *
 * `sub` ONLY. Passing an email here would put PII into telemetry and violate Principle VII.
 */
export function identifyCustomer(sub: string) {
  if (!started || getConsent() !== "granted") return
  posthog.identify(sub)
}

export function resetIdentity() {
  if (!started) return
  posthog.reset()
}
