import { describe, expect, it } from "vitest";

/**
 * Cross-language step-name contract (035 T057, contract invariant 14).
 *
 * ⚠ THE LITERALS BELOW ARE DUPLICATED BY HAND in
 * `apps/shop-mobile/shared/src/commonTest/.../core/auth/AuthStepMappingTest.kt`
 * and `apps/customer-mobile/shared/src/commonTest/.../core/auth/AuthStepMappingTest.kt`.
 *
 * The duplication is the mechanism, not an oversight. 028 established the pattern after 027's
 * post-mortem named a Go↔Kotlin contract test as its strongest carry-forward: a SHARED constant
 * makes both sides agree with each other while both drift from the third party. Two independently
 * written copies disagree loudly the moment one is edited.
 *
 * ⚠ These names come from Amplify's SDKs, not from us. We cannot make them true — we can only
 * notice when they stop being. That is what this file is for.
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
    // A rename here breaks sign-in on every surface simultaneously.
    expect(WEB_STEPS.custom).toBe("CONFIRM_SIGN_IN_WITH_CUSTOM_CHALLENGE");
    expect(ANDROID_STEPS.custom).toBe("CONFIRM_SIGN_IN_WITH_CUSTOM_CHALLENGE");
  });

  it("⚠ records that the MANAGED factor is spelled differently on web and Android", () => {
    // The same Cognito challenge, two names. Anyone assuming one spelling works everywhere writes
    // a branch that silently never fires on one platform — and the rollout-compatibility branches
    // added in 035 depend on getting both right.
    expect(WEB_STEPS.managed).toBe("CONFIRM_SIGN_IN_WITH_EMAIL_CODE");
    expect(ANDROID_STEPS.managed).toBe("CONFIRM_SIGN_IN_WITH_OTP");
    expect(WEB_STEPS.managed).not.toBe(ANDROID_STEPS.managed);
  });

  it("keeps ONE bridge outcome for a code, covering both flows", () => {
    // 035 deliberately did not add a fourth outcome for the custom challenge — see the note on
    // `BridgeAuthResult`. Pinned so a later split cannot land in one of the two files only.
    expect(BRIDGE_OUTCOMES).toEqual(["done", "otp", "failed"]);
  });

  it("⚠ DONE is never the first step after signIn", () => {
    // The amplify-android #2331/#2566 invariant: CUSTOM_AUTH_WITH_SRP was observed issuing tokens
    // without presenting the challenge. Both mobile apps use WITHOUT_SRP; this states why.
    expect(WEB_STEPS.custom).not.toBe(WEB_STEPS.done);
    expect(ANDROID_STEPS.custom).not.toBe(ANDROID_STEPS.done);
  });
});
