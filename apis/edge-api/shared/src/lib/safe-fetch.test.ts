import type { LookupAddress } from "node:dns";

import { describe, expect, it } from "vitest";

import { fetchPicture, isBlockedAddress, SafeFetchError } from "./safe-fetch";

/** A resolver that answers every name with these addresses. */
const resolvesTo = (...addresses: string[]) =>
  ((_host: string, _opts: unknown, cb: (err: null, a: LookupAddress[]) => void) =>
    cb(null, addresses.map((address) => ({ address, family: address.includes(":") ? 6 : 4 })))) as never;

const reason = async (p: Promise<unknown>) => {
  try {
    await p;
    return "fetched";
  } catch (e) {
    return e instanceof SafeFetchError ? e.reason : `other:${(e as Error).message}`;
  }
};

describe("102 - fetching a picture from an untrusted link", () => {
  it.each([
    "127.0.0.1", "10.1.2.3", "172.16.0.1", "172.31.255.255", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0",
    "224.0.0.1", "::1", "fc00::1", "fd12:3456::1", "fe80::1", "::ffff:10.0.0.1", "::ffff:a00:1", "not-an-ip",
  ])("blocks %s", (a) => {
    expect(isBlockedAddress(a)).toBe(true);
  });

  it.each(["8.8.8.8", "1.1.1.1", "172.32.0.1", "2606:4700:4700::1111"])("allows %s", (a) => {
    expect(isBlockedAddress(a)).toBe(false);
  });

  it("fetches only https links that are links", async () => {
    expect(await reason(fetchPicture("http://example.com/a.jpg"))).toBe("not_https");
    expect(await reason(fetchPicture("ftp://example.com/a.jpg"))).toBe("not_https");
    expect(await reason(fetchPicture("a picture of bread"))).toBe("bad_link");
    expect(await reason(fetchPicture("https://user:pw@example.com/a.jpg"))).toBe("bad_link");
  });

  it("refuses a literal private address before connecting", async () => {
    expect(await reason(fetchPicture("https://169.254.169.254/latest/meta-data"))).toBe("private_address");
    expect(await reason(fetchPicture("https://[::1]/a.jpg"))).toBe("private_address");
  });

  it("refuses a name that resolves to a private address, even alongside a public one, at connect time", async () => {
    expect(await reason(fetchPicture("https://pictures.example/a.jpg", { lookup: resolvesTo("10.0.0.5") }))).toBe("private_address");
    expect(await reason(fetchPicture("https://pictures.example/a.jpg", { lookup: resolvesTo("93.184.216.34", "127.0.0.1") }))).toBe(
      "private_address",
    );
  });
});
