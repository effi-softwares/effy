import { describe, expect, it } from "vitest";

import { recipientAllowed } from "../src/send.js";

/**
 * ⚠ The fail-closed non-production recipient allowlist (spec FR-043 / SC-012). The canonical
 * in-house-email disaster — a developer mailing the production user table — is one env var away, and
 * this platform has been bitten four times by configuration tests supplied to themselves. So the
 * guard is pure and directly unit-tested, with the environment passed in rather than read from
 * `process.env`, so the test cannot accidentally depend on the ambient one.
 */

const env = (over: Record<string, string | undefined>): NodeJS.ProcessEnv => ({ ...over });

describe("recipientAllowed", () => {
  it("permits ANY recipient in production — the allowlist is a non-prod safety only", () => {
    expect(recipientAllowed("anyone@anywhere.com", env({ EFFY_ENV: "prod" }))).toBe(true);
    expect(recipientAllowed("Anyone@Anywhere.com", env({ EFFY_ENV: "PROD" }))).toBe(true);
  });

  it("⚠ refuses EVERYTHING when the allowlist is unset in non-prod — the safe default", () => {
    // The opposite default ("no list, no restriction") is exactly how a misdeployed service silently
    // regains the ability to mail the world.
    expect(recipientAllowed("real@customer.com", env({ EFFY_ENV: "dev" }))).toBe(false);
    expect(recipientAllowed("real@customer.com", env({ EFFY_ENV: "dev", MAIL_NONPROD_ALLOWLIST: "" }))).toBe(false);
    expect(recipientAllowed("real@customer.com", env({ EFFY_ENV: "dev", MAIL_NONPROD_ALLOWLIST: "  " }))).toBe(false);
  });

  it("always permits the mailbox simulator, whatever the allowlist says", () => {
    // This is what lets the phantom/timing-parity path and the bounce-consumer proof run in dev.
    const e = env({ EFFY_ENV: "dev" });
    expect(recipientAllowed("success@simulator.amazonses.com", e)).toBe(true);
    expect(recipientAllowed("bounce+auth-sign-in-code@simulator.amazonses.com", e)).toBe(true);
  });

  it("permits an exact-match address", () => {
    const e = env({ EFFY_ENV: "dev", MAIL_NONPROD_ALLOWLIST: "dev@effy.test, qa@effy.test" });
    expect(recipientAllowed("dev@effy.test", e)).toBe(true);
    expect(recipientAllowed("DEV@EFFY.TEST", e)).toBe(true); // case-insensitive
    expect(recipientAllowed("someone@effy.test", e)).toBe(false);
  });

  it("permits a whole-domain entry (@domain)", () => {
    const e = env({ EFFY_ENV: "dev", MAIL_NONPROD_ALLOWLIST: "@effy.test" });
    expect(recipientAllowed("anybody@effy.test", e)).toBe(true);
    expect(recipientAllowed("anybody@other.test", e)).toBe(false);
  });

  it("⚠ is not bypassable by a stray unknown env value — only EFFY_ENV=prod opens it", () => {
    expect(recipientAllowed("real@customer.com", env({ EFFY_ENV: "production-ish", MAIL_NONPROD_ALLOWLIST: "@effy.test" }))).toBe(false);
    expect(recipientAllowed("real@customer.com", env({ MAIL_NONPROD_ALLOWLIST: "@effy.test" }))).toBe(false); // EFFY_ENV unset
  });
});
