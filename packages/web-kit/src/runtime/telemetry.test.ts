import { describe, expect, it } from "vitest";

import { createTelemetry } from "./telemetry";

interface TestEvent {
  name: "auth_sign_in_started" | "auth_sign_in_succeeded";
  subject?: string;
}

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
  });
});
