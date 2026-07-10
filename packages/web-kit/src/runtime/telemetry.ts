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
}: TelemetryConfig): Telemetry<TEvent> {
  let ready = false;

  return {
    init(): void {
      if (!key) return; // no key → no-op, never a crash
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
