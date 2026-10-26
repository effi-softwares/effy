import { describe, expect, it } from "vitest";

import { render } from "../src/render.js";
import { replyAddressFor, profileFor, type MailIdentity } from "../src/audience.js";

const identity: MailIdentity = {
  sender: "Effy <no-reply@dev.effyshopping.com>",
  replyToPublic: "hello@effyshopping.com",
  replyToInternal: "workspace-admin@effyshopping.com",
  postalAddress: "[postal address]",
};

const vars = { code: "482917", expiryMinutes: 5, isInternal: false } as const;

describe("render", () => {
  it("substitutes into both the HTML and the text part", () => {
    const m = render("auth-sign-in-code", vars, "customer", identity);
    expect(m.html).toContain("482917");
    expect(m.text).toContain("482917");
    expect(m.html).not.toContain("{{");
    expect(m.text).not.toContain("{{");
  });

  it("puts the code in the subject but NOT in the preheader", () => {
    const m = render("auth-sign-in-code", vars, "customer", identity);
    expect(m.subject).toBe("482917 is your Effy sign-in code");
    expect(m.preheader).not.toContain("482917");
    expect(m.preheader).not.toBe(m.subject);
  });

  it("addresses each audience by its own product name", () => {
    expect(render("auth-sign-in-code", vars, "shop", identity).subject).toContain("Effy Shop");
    expect(render("auth-sign-in-code", vars, "driver", identity).subject).toContain("Effy Driver");
  });

  it("switches the wording for internal audiences", () => {
    const internal = render("auth-sign-in-code", { ...vars, isInternal: true }, "shop", identity);
    expect(internal.text).toContain("work account");
    expect(render("auth-sign-in-code", vars, "customer", identity).text).not.toContain("work account");
  });

  it("refuses a message that is not addressed to that audience", () => {
    expect(() => render("account-password-changed", { isFirstPassword: false }, "driver", identity))
      .toThrow(/not addressed to the 'driver' audience/);
  });

  it("refuses invalid variables with the template id attached", () => {
    // @ts-expect-error
    expect(() => render("auth-sign-in-code", { code: "1" }, "customer", identity))
      .toThrow(/auth-sign-in-code/);
  });

  describe("escaping", () => {
    it("escapes markup in a substituted value", () => {
      const hostile = { code: '<script>alert(1)</script>', expiryMinutes: 5, isInternal: false };
      const m = render("auth-sign-in-code", hostile, "customer", identity);
      expect(m.html).not.toContain("<script>");
      expect(m.html).toContain("&lt;script&gt;");
    });

    it("cannot be used to close a tag and inject an attribute", () => {
      const hostile = { code: '"><img src=x onerror=alert(1)>', expiryMinutes: 5, isInternal: false };
      const m = render("auth-sign-in-code", hostile, "customer", identity);
      expect(m.html).not.toContain("onerror=");
    });
  });

  describe("platform values", () => {
    it("injects the footer values and lets no call site override them", () => {
      const m = render(
        "auth-sign-in-code",
        // @ts-expect-error
        { ...vars, effySupportEmail: "attacker@example.com" },
        "customer",
        identity,
      );
      expect(m.html).toContain("hello@effyshopping.com");
      expect(m.html).not.toContain("attacker@example.com");
    });

    it("derives the reply address from the audience", () => {
      expect(replyAddressFor(profileFor("customer"), identity)).toBe("hello@effyshopping.com");
      expect(replyAddressFor(profileFor("shop"), identity)).toBe("workspace-admin@effyshopping.com");
      expect(replyAddressFor(profileFor("back-office"), identity)).toBe("workspace-admin@effyshopping.com");
    });
  });

  describe("text/plain is not HTML", () => {
    const url = "https://x.test/newsletter/confirm?token=ABC123&src=email";

    it("renders a query-string URL verbatim in the text part", () => {
      const m = render(
        "newsletter-confirmation",
        { confirmUrl: url, expiresIn: "24 hours" },
        "customer",
        identity,
      );

      expect(m.text).toContain(url);
      expect(m.text).not.toContain("&#x3D;");
      expect(m.text).not.toContain("&amp;");
    });

    it("still escapes the HTML part, because that one really is markup", () => {
      const m = render(
        "newsletter-confirmation",
        { confirmUrl: '"><script>alert(1)</script>', expiresIn: "24 hours" },
        "customer",
        identity,
      );

      expect(m.html).not.toContain("<script>");
    });
  });

  it("leaves Cognito's {####} placeholder untouched", async () => {
    const Handlebars = (await import("handlebars")).default;
    const out = Handlebars.compile("code {####} and {{code}}")({ code: "482917" });
    expect(out).toBe("code {####} and 482917");
  });
});
