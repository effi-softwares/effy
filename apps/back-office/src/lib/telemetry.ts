import { createTelemetry } from "@effy/web-kit";

import { config } from "./env";

// Product analytics + web error tracking (Principle VII). The PostHog wiring is shared; the event
// TAXONOMY is this surface's own — a typed union, so a future screen extends it rather than
// inventing free-form strings. No PII beyond the verified subject id.
export type AnalyticsEvent =
  | { name: "auth_sign_in_started" }
  | { name: "auth_otp_submitted" }
  | { name: "auth_sign_in_succeeded"; subject: string }
  | { name: "auth_sign_in_failed"; reason: string }
  | { name: "auth_signed_out" }
  | { name: "admin_area_access_denied" };

const telemetry = createTelemetry<AnalyticsEvent>({
  key: config.posthogKey(),
  host: config.posthogHost(),
  surface: "back-office",
});

export const initTelemetry = telemetry.init;
export const track = telemetry.track;
export const reportError = telemetry.reportError;
