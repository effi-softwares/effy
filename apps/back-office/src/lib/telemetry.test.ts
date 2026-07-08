import { describe, expect, it } from "vitest";

import { track } from "./telemetry";

describe("telemetry", () => {
  // Without VITE_POSTHOG_KEY, initTelemetry() is never armed → track() must degrade to a no-op
  // (never a crash), and carry no PII (FR-013). Events are a typed union — no free-form strings.
  it("track is a safe no-op when unconfigured", () => {
    expect(() => {
      track({ name: "auth_sign_in_started" });
      track({ name: "auth_sign_in_succeeded", subject: "sub-1" });
      track({ name: "admin_area_access_denied" });
    }).not.toThrow();
  });
});
