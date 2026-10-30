import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { publicImageUrl } from "./media-public";

const BASE = "https://media.dev.effyshopping.com";

describe("publicImageUrl (086 contracts/public-media.md)", () => {
  beforeEach(() => {
    process.env.MEDIA_PUBLIC_BASE_URL = `${BASE}/`;
  });
  afterEach(() => {
    delete process.env.MEDIA_PUBLIC_BASE_URL;
  });

  it("is null for no key", () => {
    expect(publicImageUrl(null)).toBeNull();
    expect(publicImageUrl(undefined)).toBeNull();
    expect(publicImageUrl("")).toBeNull();
  });

  it.each([
    "products/owner/abc.jpg",
    "promotions/p1/abc.png",
    "renditions/products/owner/abc/w320.webp",
  ])("builds the address of a public key: %s", (key) => {
    expect(publicImageUrl(key)).toBe(`${BASE}/${key}`);
  });

  it("is the same on every call - nothing varies by time or request", () => {
    expect(publicImageUrl("products/o/a.jpg")).toBe(publicImageUrl("products/o/a.jpg"));
  });

  it.each([
    "courier-label/pkg/abc.pdf",
    "proof/del/abc.jpg",
    "feedback/x/abc.jpg",
    "something-new/abc.jpg",
    "products",
    "Products/o/a.jpg",
  ])("refuses a key outside the public set: %s", (key) => {
    expect(publicImageUrl(key)).toBeNull();
  });

  it.each([
    "/products/o/a.jpg",
    "products//a.jpg",
    "products/../proof/a.jpg",
    "products/./a.jpg",
    "products/o/a\u0000.jpg",
    "products/o/a\n.jpg",
  ])("refuses a key that is not a plain relative path: %j", (key) => {
    expect(publicImageUrl(key)).toBeNull();
  });

  it("encodes each segment and keeps the slashes", () => {
    expect(publicImageUrl("products/o w/a b.jpg")).toBe(`${BASE}/products/o%20w/a%20b.jpg`);
  });

  it("stops a deployment that forgot the base address", () => {
    delete process.env.MEDIA_PUBLIC_BASE_URL;
    expect(() => publicImageUrl("products/o/a.jpg")).toThrow("MEDIA_PUBLIC_BASE_URL is not configured");
  });
});
