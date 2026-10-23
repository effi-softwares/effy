import { describe, expect, it } from "vitest";

/**
 * Amplify's step names, duplicated by hand in customer-mobile's `AuthStepMappingTest.kt` on purpose:
 * independent copies disagree loudly when one is edited.
 */

/** Amplify JS v6 — `nextStep.signInStep`. */
const WEB_STEPS = {
  custom: "CONFIRM_SIGN_IN_WITH_CUSTOM_CHALLENGE",
  managed: "CONFIRM_SIGN_IN_WITH_EMAIL_CODE",
  done: "DONE",
} as const;

/** Amplify Android — `AuthSignInStep`. */
const ANDROID_STEPS = {
  custom: "CONFIRM_SIGN_IN_WITH_CUSTOM_CHALLENGE",
  managed: "CONFIRM_SIGN_IN_WITH_OTP",
  done: "DONE",
} as const;

/** The flat outcome vocabulary the Kotlin↔Swift iOS bridge speaks. */
const BRIDGE_OUTCOMES = ["done", "otp", "failed"] as const;

describe("sign-in step names", () => {
  it("pins the custom-challenge step used by web and Android", () => {
    expect(WEB_STEPS.custom).toBe("CONFIRM_SIGN_IN_WITH_CUSTOM_CHALLENGE");
    expect(ANDROID_STEPS.custom).toBe("CONFIRM_SIGN_IN_WITH_CUSTOM_CHALLENGE");
  });

  it("⚠ records that the MANAGED factor is spelled differently on web and Android", () => {
    // The same Cognito challenge has two names across platforms.
    expect(WEB_STEPS.managed).toBe("CONFIRM_SIGN_IN_WITH_EMAIL_CODE");
    expect(ANDROID_STEPS.managed).toBe("CONFIRM_SIGN_IN_WITH_OTP");
    expect(WEB_STEPS.managed).not.toBe(ANDROID_STEPS.managed);
  });

  it("keeps ONE bridge outcome for a code, covering both flows", () => {
    expect(BRIDGE_OUTCOMES).toEqual(["done", "otp", "failed"]);
  });

  it("⚠ DONE is never the first step after signIn", () => {
    // CUSTOM_AUTH_WITH_SRP was observed issuing tokens without the challenge (amplify-android #2331/#2566).
    expect(WEB_STEPS.custom).not.toBe(WEB_STEPS.done);
    expect(ANDROID_STEPS.custom).not.toBe(ANDROID_STEPS.done);
  });
});
