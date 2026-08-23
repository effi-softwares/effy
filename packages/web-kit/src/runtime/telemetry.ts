import posthog from "posthog-js";

/**
 * Product analytics + web error tracking (constitution Principle VII).
 *
 * Every surface stamps a `surface` super-property so its events are distinguishable from another
 * console's. No PII beyond the authenticated subject id — never an email, an OTP code, a token, or
 * any identifier an operator typed.
 *
 * Absent key ⇒ every call is a no-op. Telemetry never crashes a console.
 */

/** A surface's event union: `{ name: "..." }` plus whatever non-PII props that event carries. */
export interface TelemetryEvent {
  name: string;
}

export interface TelemetryConfig {
  key: string | undefined;
  host: string | undefined;
  /** e.g. "back-office", "shop-web" — stamped on every event. */
  surface: string;
  /**
   * Platform-wide analytics kill switch (050 FR-026). `false` ⇒ init is a no-op — no SDK loads, no
   * collection — without an app release. Undefined/true ⇒ enabled. Scope is analytics only.
   */
  enabled?: boolean;
}

export interface Telemetry<TEvent extends TelemetryEvent> {
  init(): void;
  track(event: TEvent): void;
  reportError(error: unknown, context?: Record<string, string>): void;
}

export function createTelemetry<TEvent extends TelemetryEvent>({
  key,
  host,
  surface,
  enabled = true,
}: TelemetryConfig): Telemetry<TEvent> {
  let ready = false;

  return {
    init(): void {
      if (!key) return; // no key → no-op, never a crash
      if (!enabled) return; // kill switch (050 FR-026) → no SDK loads, no collection
      posthog.init(key, {
        api_host: host ?? "https://us.i.posthog.com",
        capture_pageview: false,
        autocapture: false,
        person_profiles: "identified_only",
      });
      posthog.register({ surface });
      ready = true;
    },

    track(event: TEvent): void {
      if (!ready) return;
      const { name, ...props } = event;
      posthog.capture(name, props);
    },

    reportError(error: unknown, context?: Record<string, string>): void {
      if (!ready) return;
      posthog.capture("$exception", {
        message: error instanceof Error ? error.message : String(error),
        ...context,
      });
    },
  };
}

/**
 * Route uncaught browser errors + unhandled promise rejections to `reportError` (050 US1, FR-002).
 * Call once at bootstrap after `init()`. A no-op if telemetry is unconfigured/killed (reportError
 * itself guards on readiness). No PII beyond the error message + a `source` tag.
 */
export function wireGlobalErrorReporting(
  reportError: (error: unknown, context?: Record<string, string>) => void,
): void {
  if (typeof window === "undefined") return;
  window.addEventListener("error", (e) => {
    reportError(e.error ?? e.message, { source: "window.onerror" });
  });
  window.addEventListener("unhandledrejection", (e) => {
    reportError(e.reason, { source: "unhandledrejection" });
  });
}
