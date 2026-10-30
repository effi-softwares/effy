import posthog from "posthog-js";

/**
 * Product analytics and web error tracking. Every surface stamps a `surface` super-property. No PII
 * beyond the subject id. With no key every call is a no-op.
 */

/** A surface's event union: `{ name: "..." }` plus whatever non-PII props that event carries. */
export interface TelemetryEvent {
  name: string;
}

export interface TelemetryConfig {
  key: string | undefined;
  host: string | undefined;
  /** e.g. "back-office", "shop-web" - stamped on every event. */
  surface: string;
  /** The analytics kill switch: `false` makes init a no-op (no SDK, no collection). */
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
      if (!enabled) return;
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

/** Routes uncaught errors and unhandled rejections to `reportError`. Call once after `init`. */
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
