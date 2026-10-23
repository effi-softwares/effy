import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { render } from "../src/render.js";
import { CATALOG, validateVars } from "../src/catalog.js";
import type { MailIdentity } from "../src/audience.js";

/**
 * The two feedback messages, with opposite failure policies; both expose only what the shopper gave
 * and render pasted markup as inert text.
 */

const here = dirname(fileURLToPath(import.meta.url));
const loadFixture = (name: string) =>
  JSON.parse(readFileSync(resolve(here, "../src/fixtures", name), "utf8"));

const identity: MailIdentity = {
  sender: "Effy <no-reply@dev.effyshopping.com>",
  replyToPublic: "hello@effyshopping.com",
  replyToInternal: "workspace-admin@effyshopping.com",
  postalAddress: "1 Test St, Sydney NSW",
};

const received = loadFixture("feedback-received.json");
const reply = loadFixture("feedback-reply.json");

describe("feedback-received — acknowledgement", () => {
  it("validates against its declared variables", () => {
    expect(validateVars("feedback-received", received)).toEqual([]);
  });

  it("shows the reference code and category in both parts", () => {
    const m = render("feedback-received", received, "customer", identity);
    for (const part of [m.html, m.text]) {
      expect(part).toContain(received.referenceCode);
      expect(part).toContain(received.category);
    }
  });

  /** Swallow: the submission is stored and the shopper was told "received". Transactional. */
  it("swallows on send failure and carries no unsubscribe URL", () => {
    expect(CATALOG["feedback-received"].onSendFailure).toBe("swallow");
    expect(CATALOG["feedback-received"].category).toBe("transactional");
    expect(CATALOG["feedback-received"]).not.toHaveProperty("unsubscribeUrl");
  });

  it("promises no reply timeline or reward", () => {
    const m = render("feedback-received", received, "customer", identity);
    const body = `${m.html} ${m.text}`.toLowerCase();
    expect(body).not.toMatch(/within \d+ (hours|days|business days)/);
    expect(body).not.toMatch(/\bvoucher\b|\bcoupon\b|\breward\b|\d+\s*%\s*off/);
  });
});

describe("feedback-reply — staff reply", () => {
  it("validates against its declared variables", () => {
    expect(validateVars("feedback-reply", reply)).toEqual([]);
  });

  it("carries the reply body and quotes the original in both parts", () => {
    const m = render("feedback-reply", reply, "customer", identity);
    // Punctuation-free substrings: the HTML render escapes apostrophes and dashes.
    for (const part of [m.html, m.text]) {
      expect(part).toContain("moved it to the top of the results");
      expect(part).toContain("The category filter on the search page is really hard to find");
    }
  });

  /** Throw: a swallowed failure would mark the submission replied while the shopper got nothing. */
  it("throws on send failure", () => {
    expect(CATALOG["feedback-reply"].onSendFailure).toBe("throw");
    expect(CATALOG["feedback-reply"].category).toBe("transactional");
  });

  /** Pasted markup renders inert. */
  it("renders pasted markup as inert text (no live script tag)", () => {
    const hostile = {
      ...reply,
      replyBody: "Thanks! <script>alert('x')</script> <b>bold</b>",
      originalMessage: "Bug: <img src=x onerror=alert(1)> broke the page",
    };
    const m = render("feedback-reply", hostile, "customer", identity);
    expect(m.html).not.toContain("<script>");
    expect(m.html).not.toContain("<img src=x");
    expect(m.html).toContain("&lt;script&gt;");
  });

  /** The reply exposes only its declared vars: no internal note or id can reach it. */
  it("declares only whitelisted, non-internal variables", () => {
    const declared = Object.keys(CATALOG["feedback-reply"].vars);
    expect(declared.sort()).toEqual(
      ["category", "originalMessage", "referenceCode", "replyBody"].sort(),
    );
    for (const forbidden of ["note", "internalId", "staffSub", "submissionId"]) {
      expect(declared).not.toContain(forbidden);
    }
  });
});
