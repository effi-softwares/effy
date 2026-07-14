import { afterEach, describe, expect, it, vi } from "vitest";

import { BreachCheckUnavailableError, isPasswordBreached } from "./password";

/**
 * The SHA-1 of "password" is 5BAA61E4C9B93F3F0682250B6CF8331B7EE68FD8.
 * Prefix = 5BAA6, suffix = 1E4C9B93F3F0682250B6CF8331B7EE68FD8. That split is the whole protocol,
 * and these tests assert it holds — because the day it silently stops holding, every password on the
 * platform is unscreened and nothing fails.
 */
const PWNED_PREFIX = "5BAA6";
const PWNED_SUFFIX = "1E4C9B93F3F0682250B6CF8331B7EE68FD8";

function mockRange(body: string, ok = true, status = 200) {
  const fetchMock = vi.fn(async (_url: string | URL, _init?: RequestInit) => ({
    ok,
    status,
    text: async () => body,
  }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("isPasswordBreached", () => {
  it("flags a password present in the corpus", async () => {
    mockRange(`${PWNED_SUFFIX}:24230577\nAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA:1`);
    await expect(isPasswordBreached("password")).resolves.toBe(true);
  });

  it("clears a password absent from the corpus", async () => {
    mockRange("AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA:1\nBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB:2");
    await expect(isPasswordBreached("a-genuinely-unusual-passphrase")).resolves.toBe(false);
  });

  // ⚠ THE TEST THIS FILE EXISTS FOR.
  //
  // If the password itself is ever sent, this is the only thing standing between us and a
  // catastrophic own-goal — shipping our customers' chosen passwords to a third party in order to
  // ask whether they are safe. Assert the request URL contains the 5-char PREFIX and, emphatically,
  // NOT the password, NOT the full digest, and NOT the suffix.
  it("NEVER transmits the password, the full digest, or the suffix — only a 5-char prefix", async () => {
    const fetchMock = mockRange("");

    // A distinctive secret. ⚠ Do NOT use the literal string "password" here: the endpoint host is
    // `api.pwnedpasswords.com`, so a naive `not.toContain("password")` passes for the wrong reason
    // and the assertion silently stops meaning anything. (It did, on the first run of this file.)
    const secret = "correct-horse-battery-staple-42";
    await isPasswordBreached(secret);

    const [url] = fetchMock.mock.calls[0]!;
    const asString = String(url);
    const sent = asString.slice(asString.indexOf("/range/") + "/range/".length);

    expect(sent).toHaveLength(5); // the prefix, and nothing else
    expect(asString).not.toContain(secret);
    expect(asString).not.toContain(encodeURIComponent(secret));
  });

  it("requests padded responses, so reply size cannot leak the prefix", async () => {
    const fetchMock = mockRange("");
    await isPasswordBreached("password");

    const [, init] = fetchMock.mock.calls[0]!;
    const headers = init?.headers as Record<string, string>;
    expect(headers["Add-Padding"]).toBe("true");
  });

  // ⚠ FAIL CLOSED. If the breach service is down, the password is REFUSED — not waved through.
  //
  // Failing open here would mean an outage at a third party silently disables the platform's only
  // defence against breached passwords, at precisely the moment nobody is watching. Affordable on
  // Effy because a password is optional: the customer can still sign in with an emailed code.
  it("throws (fail-closed) when the breach service errors", async () => {
    mockRange("", false, 503);
    await expect(isPasswordBreached("anything")).rejects.toBeInstanceOf(BreachCheckUnavailableError);
  });

  it("throws (fail-closed) when the breach service times out or the network dies", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("ETIMEDOUT");
      }),
    );
    await expect(isPasswordBreached("anything")).rejects.toBeInstanceOf(BreachCheckUnavailableError);
  });

  it("matches case-insensitively against the corpus's uppercase suffixes", async () => {
    mockRange(`${PWNED_SUFFIX.toLowerCase()}:1`);
    // The corpus returns uppercase; if we ever start lowercasing our digest this must not silently
    // start clearing breached passwords. It should NOT match a lowercased corpus line by accident.
    await expect(isPasswordBreached("password")).resolves.toBe(false);
  });
});
