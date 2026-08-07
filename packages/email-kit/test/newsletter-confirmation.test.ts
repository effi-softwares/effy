import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { render } from "../src/render.js";
import { CATALOG, validateVars } from "../src/catalog.js";
import type { MailIdentity } from "../src/audience.js";

/**
 * newsletter-confirmation (039 US6) — the double opt-in step.
 *
 * ⚠ This message IS the consent, not a receipt for it. Nobody is subscribed until its link is
 * followed, which is what makes an anonymous, open subscribe form safe: a stranger can type someone
 * else's address in and the only consequence is one ignorable email to the address's real owner.
 * These tests pin the properties that keep that true.
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

const vars = loadFixture("newsletter-confirmation.json");

/** The handful of entities Handlebars' escaper emits — enough to compare an href honestly. */
const decodeEntities = (s: string) =>
  s
    .replace(/&#x3D;/g, "=")
    .replace(/&amp;/g, "&")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"');

describe("newsletter-confirmation — the confirm link", () => {
  it("validates against its declared variables", () => {
    expect(validateVars("newsletter-confirmation", vars)).toEqual([]);
  });

  /**
   * ⚠ THE URL MUST APPEAR IN BOTH PARTS. A confirm link present only in the HTML is unusable to anyone
   * reading the plain-text alternative — and, more to the point, to anyone whose client blocks HTML.
   * The subscription would be permanently unconfirmable with no error anywhere.
   */
  it("carries the confirm URL in the HTML *and* the text part", () => {
    const m = render("newsletter-confirmation", vars, "customer", identity);

    // ⚠ The two parts are compared differently ON PURPOSE, and the difference is the whole point.
    //
    // HTML: the href is entity-escaped (`=` → `&#x3D;`), which is correct and harmless — clients
    // decode entities inside attribute values. So it is decoded before comparing rather than asserted
    // raw, which would only pin an implementation detail of Handlebars' escaper.
    //
    // TEXT: compared RAW, because nothing decodes a text/plain body. An escaped URL there is a
    // malformed one, and that is exactly the defect this template surfaced in the shared render path.
    const href = /href="([^"]*confirm[^"]*)"/.exec(m.html)?.[1] ?? "";
    expect(decodeEntities(href)).toBe(vars.confirmUrl);

    expect(m.text).toContain(vars.confirmUrl);
    expect(m.text).not.toContain("&#x3D;");
  });

  it("states how long the link lasts, in both parts", () => {
    const m = render("newsletter-confirmation", vars, "customer", identity);

    expect(m.html).toContain(vars.expiresIn);
    expect(m.text).toContain(vars.expiresIn);
  });

  /**
   * ⚠ The line that makes an unrequested email harmless. Without it, someone who never signed up
   * receives an unexplained message about a subscription and has no idea whether ignoring it is safe.
   */
  it("tells a recipient who never signed up that ignoring it is enough", () => {
    const m = render("newsletter-confirmation", vars, "customer", identity);

    expect(m.text.toLowerCase()).toMatch(/ignore this email/);
    expect(m.html.toLowerCase()).toMatch(/ignore this email/);
  });
});

describe("newsletter-confirmation — no unbacked claim (FR-034)", () => {
  /**
   * ⚠ THE REFERENCE STOREFRONT'S NEWSLETTER BAND PROMISES "Get 20% Off On Your First Purchase". Effy
   * has no such promotion. A discount claim in an opt-in email is a contract with the reader, and this
   * one would be unenforceable — the platform has nothing to honour it with.
   */
  it("promises no discount, incentive or reward", () => {
    const m = render("newsletter-confirmation", vars, "customer", identity);
    const body = `${m.html} ${m.text} ${m.subject}`.toLowerCase();

    expect(body).not.toMatch(/\d+\s*%\s*(off|discount)/);
    expect(body).not.toMatch(/\bvoucher\b|\bcoupon\b|\breward\b|\bfree (delivery|shipping)\b/);
    expect(body).not.toMatch(/\bdiscount\b/);
  });
});

describe("newsletter-confirmation — category and footer (038 doctrine)", () => {
  /**
   * ⚠ `transactional`, and therefore NO unsubscribe footer — which looks wrong for something
   * newsletter-shaped until you notice there is nothing yet to unsubscribe FROM. Nobody is subscribed
   * until the link is followed. The recipient's exit is to ignore it.
   *
   * This is pinned because the instinct to "fix" it is strong, and the catalogue's discriminated union
   * would then demand an unsubscribe URL for a subscription that does not exist.
   */
  it("is transactional, so it carries no unsubscribe URL", () => {
    const entry = CATALOG["newsletter-confirmation"];

    expect(entry.category).toBe("transactional");
    expect(entry).not.toHaveProperty("unsubscribeUrl");
  });

  /**
   * ⚠ `throw`, unlike `account-password-changed`'s `swallow`. There the change had already happened
   * irreversibly, so failing the request would tell the customer a lie. Here the row is written before
   * the send and nothing irreversible has occurred, so a swallowed failure strands a subscriber at
   * `pending` with a token they never received — believing they signed up, never confirming, and
   * unreachable forever.
   */
  it("throws on send failure, so the visitor can retry", () => {
    expect(CATALOG["newsletter-confirmation"].onSendFailure).toBe("throw");
  });

  it("is sent by the platform, not by Cognito", () => {
    expect(CATALOG["newsletter-confirmation"].sentBy).toBe("platform");
  });
});
