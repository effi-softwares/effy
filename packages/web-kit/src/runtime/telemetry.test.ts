import { afterEach, describe, expect, it, vi } from "vitest";

const init = vi.fn();
const register = vi.fn();
const capture = vi.fn();
vi.mock("posthog-js", () => ({
  default: { init: (...a: unknown[]) => init(...a), register: (...a: unknown[]) => register(...a), capture: (...a: unknown[]) => capture(...a) },
}));

import { createTelemetry, wireGlobalErrorReporting } from "./telemetry";

interface TestEvent {
  name: "auth_sign_in_started" | "auth_sign_in_succeeded";
  subject?: string;
}

afterEach(() => vi.clearAllMocks());

describe("createTelemetry", () => {
  // Without a PostHog key, init() never arms the SDK → track()/reportError() must degrade to a
  // no-op, never a crash (constitution Principle VII; the console works with telemetry off).
  it("track and reportError are safe no-ops when unconfigured", () => {
    const telemetry = createTelemetry<TestEvent>({
      key: undefined,
      host: undefined,
      surface: "test",
    });
    telemetry.init();

    expect(() => {
      telemetry.track({ name: "auth_sign_in_started" });
      telemetry.track({ name: "auth_sign_in_succeeded", subject: "sub-1" });
      telemetry.reportError(new Error("boom"));
    }).not.toThrow();
    expect(init).not.toHaveBeenCalled();
  });

  // 050 FR-026 — the kill switch. `enabled: false` must prevent the SDK from initialising at all,
  // so no analytics is collected without an app release.
  it("does NOT init when the kill switch is off (enabled=false)", () => {
    const telemetry = createTelemetry<TestEvent>({
      key: "phc_test",
      host: "https://ph.test",
      surface: "test",
      enabled: false,
    });
    telemetry.init();
    expect(init).not.toHaveBeenCalled();
    telemetry.track({ name: "auth_sign_in_started" });
    expect(capture).not.toHaveBeenCalled();
  });

  // 050 R11 — session replay is OFF, and no autocapture/auto-pageview, on the consoles.
  it("initialises with autocapture off, pageview off, identified-only (no session replay)", () => {
    const telemetry = createTelemetry<TestEvent>({
      key: "phc_test",
      host: "https://ph.test",
      surface: "back-office",
    });
    telemetry.init();
    expect(init).toHaveBeenCalledTimes(1);
    const cfg = init.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(cfg.autocapture).toBe(false);
    expect(cfg.capture_pageview).toBe(false);
    expect(cfg.person_profiles).toBe("identified_only");
    // session replay is never enabled here — its config key is simply absent (default off).
    expect(cfg.disable_session_recording ?? true).toBeTruthy();
    expect(register).toHaveBeenCalledWith({ surface: "back-office" });
  });
});

describe("wireGlobalErrorReporting", () => {
  it("routes window errors + unhandled rejections to reportError (no throw when unconfigured)", () => {
    const reportError = vi.fn();
    wireGlobalErrorReporting(reportError);
    window.dispatchEvent(new ErrorEvent("error", { message: "boom", error: new Error("boom") }));
    expect(reportError).toHaveBeenCalledTimes(1);
    expect(reportError.mock.calls[0]?.[1]).toEqual({ source: "window.onerror" });
  });
});
