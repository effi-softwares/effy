import posthog from "posthog-js";

import { config } from "./env";

// Product analytics + web error tracking (Principle VII). Typed taxonomy so future screens extend
// it, never re-invent it. NO PII beyond the auth subject id. Degrades to a no-op if unconfigured.
export type AnalyticsEvent =
  | { name: "auth_sign_in_started" }
  | { name: "auth_otp_submitted" }
  | { name: "auth_sign_in_succeeded"; subject: string }
  | { name: "auth_sign_in_failed"; reason: string }
  | { name: "auth_signed_out" }
  | { name: "admin_area_access_denied" };

let ready = false;

export function initTelemetry(): void {
  const key = config.posthogKey();
  if (!key) return; // no key → no-op, never a crash
  posthog.init(key, {
    api_host: config.posthogHost() ?? "https://us.i.posthog.com",
    capture_pageview: false,
    autocapture: false,
    person_profiles: "identified_only",
  });
  ready = true;
}

export function track(event: AnalyticsEvent): void {
  if (!ready) return;
  const { name, ...props } = event;
  posthog.capture(name, props);
}

export function reportError(error: unknown, context?: Record<string, string>): void {
  if (!ready) return;
  posthog.capture("$exception", {
    message: error instanceof Error ? error.message : String(error),
    ...context,
  });
}
