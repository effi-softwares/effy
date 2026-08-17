import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { render } from "../src/render.js";
import { CATALOG, validateVars } from "../src/catalog.js";
import type { MailIdentity } from "../src/audience.js";

/**
 * 046 — the two feedback messages. `feedback-received` acknowledges a submission; `feedback-reply`
 * delivers a staff reply. They carry OPPOSITE failure policies, and both must expose only what the
 * shopper gave (FR-038) and render pasted markup as inert text (FR-017).
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

  /**
   * ⚠ SWALLOW — the submission is already stored and the shopper was already told "received"; a thrown
   * failure would contradict a true fact (FR-015). Transactional, so no unsubscribe footer.
   */
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
    // ⚠ Assert on punctuation-free substrings: the HTML render escapes apostrophes/dashes, so the raw
    // fixture string is not present verbatim in the HTML (it IS in the text part). These fragments
    // prove both the reply and the quoted original reach both parts without pinning the escaper.
    for (const part of [m.html, m.text]) {
      expect(part).toContain("moved it to the top of the results");
      expect(part).toContain("The category filter on the search page is really hard to find");
    }
  });

  /**
   * ⚠ THROW — nothing irreversible has happened, and the whole point is that the shopper receives it;
   * a swallowed failure would mark the submission replied while the shopper got nothing (FR-030).
   */
  it("throws on send failure", () => {
    expect(CATALOG["feedback-reply"].onSendFailure).toBe("throw");
    expect(CATALOG["feedback-reply"].category).toBe("transactional");
  });

  /**
   * ⚠ FR-017 — pasted markup must render inert. The render path escapes it, so the raw `<script>` tag
   * never appears in the HTML output.
   */
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

  /**
   * ⚠ FR-038 / G2 — the reply exposes ONLY the whitelisted vars. There is no internal-note or
   * internal-id field in the reply's declared variable set, so none can reach the rendered output.
   */
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
