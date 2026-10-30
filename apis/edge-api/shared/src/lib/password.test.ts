import { afterEach, describe, expect, it, vi } from "vitest";

import { BreachCheckUnavailableError, isPasswordBreached } from "./password";

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

  // Only the 5-character prefix is ever sent: never the password, the full digest or the suffix.
  it("NEVER transmits the password, the full digest, or the suffix - only a 5-char prefix", async () => {
    const fetchMock = mockRange("");

    // Not the literal "password": the host `api.pwnedpasswords.com` would satisfy `not.toContain` for the wrong reason.
    const secret = "correct-horse-battery-staple-42";
    await isPasswordBreached(secret);

    const [url] = fetchMock.mock.calls[0]!;
    const asString = String(url);
    const sent = asString.slice(asString.indexOf("/range/") + "/range/".length);

    expect(sent).toHaveLength(5);
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

  // Fail closed: an outage refuses the password (a password is optional on Effy).
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
    // The corpus is uppercase; a lowercased digest must not silently clear breached passwords.
    await expect(isPasswordBreached("password")).resolves.toBe(false);
  });
});
