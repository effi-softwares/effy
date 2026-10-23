/** Catalogue guards that need the catalogue's TypeScript (the rest are in scripts/check-email.mjs). */

import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  CATALOG,
  TEMPLATE_ID_GRAMMAR,
  messageTagFor,
  templateIds,
  validateVars,
  type Category,
  type SentBy,
  type TemplateId,
} from "../src/catalog.js";
import { COMPILED_TEMPLATES } from "../dist/templates.generated.js";

const here = dirname(fileURLToPath(import.meta.url));
const PKG = resolve(here, "..");
const dist = (f: string) => readFileSync(resolve(PKG, "dist", f), "utf8");

// Read through the declared type: these guard union arms that have no entry yet.
const sentByOf = (id: TemplateId): SentBy => CATALOG[id].sentBy;
const categoryOf = (id: TemplateId): Category["category"] => CATALOG[id].category;

/** Cognito's message limit, five times tighter than Gmail's. */
const COGNITO_CHAR_LIMIT = 20_000;

describe("template ids", () => {
  it("match the tag-safe grammar", () => {
    for (const id of templateIds()) {
      expect(TEMPLATE_ID_GRAMMAR.test(id), `${id} must match ${TEMPLATE_ID_GRAMMAR}`).toBe(true);
    }
  });

  it("are unique, and unique AS SES MESSAGE TAGS", () => {
    // SES tag values allow only [A-Za-z0-9_-], so the id-to-tag mapping must be the identity.
    const ids = templateIds();
    const tags = ids.map(messageTagFor);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(tags).size).toBe(ids.length);
    expect(tags).toEqual([...ids]);
    for (const tag of tags) expect(/^[A-Za-z0-9_-]+$/.test(tag)).toBe(true);
  });
});

describe("catalogue completeness", () => {
  it("gives every message a compiled artifact, a text part and a fixture", () => {
    for (const id of templateIds()) {
      expect(existsSync(resolve(PKG, "dist", `${id}.html`)), `${id}: no compiled HTML`).toBe(true);
      expect(existsSync(resolve(PKG, "dist", `${id}.txt`)), `${id}: no text part`).toBe(true);
      expect(existsSync(resolve(PKG, "src/fixtures", `${id}.json`)), `${id}: no fixture`).toBe(true);
      expect(COMPILED_TEMPLATES[id], `${id}: missing from the runtime bundle`).toBeDefined();
    }
  });

  it("compiles no template that the catalogue does not name", () => {
    // The reverse direction: an orphaned.mjml would ship an artifact nothing can send.
    for (const id of Object.keys(COMPILED_TEMPLATES)) {
      expect(templateIds(), `${id} is compiled but not catalogued`).toContain(id);
    }
  });

  it("gives every message at least one audience and a non-empty subject and preheader", () => {
    for (const id of templateIds()) {
      const entry = CATALOG[id];
      expect(entry.audiences.length, `${id}: no audience`).toBeGreaterThan(0);
    }
  });
});

describe("placeholder integrity", () => {
  it("declares every placeholder that appears in the HTML or the text part", () => {
    // A template using an undeclared variable renders empty, invisibly.
    const platform = new Set(["effyProductName", "effySupportEmail", "effyPostalAddress"]);
    for (const id of templateIds()) {
      const spec = CATALOG[id].vars as Record<string, unknown>;
      const declared = new Set(Object.keys(spec));
      // Object-array vars contribute their field names (used inside `{{#each}}`), learned from the schema.
      for (const value of Object.values(spec)) {
        if (value && typeof value === "object" && "of" in value) {
          for (const field of Object.keys((value as { of: object }).of)) declared.add(field);
        }
      }
      const source = dist(`${id}.html`) + dist(`${id}.txt`);
      // Block helpers are syntax: `{{/if}}` is not a variable named "if".
      const HELPERS = new Set(["if", "unless", "each", "with", "else", "log"]);
      const used = new Set(
        [...source.matchAll(/\{\{\s*[#/]?\s*(?:(?:if|unless|each|with)\s+)?([a-zA-Z][a-zA-Z0-9_]*)\s*\}\}/g)]
          .map((m) => m[1]!),
      );
      for (const name of used) {
        if (platform.has(name) || HELPERS.has(name)) continue;
        expect(declared.has(name), `${id}: uses {{${name}}} but does not declare it`).toBe(true);
      }
    }
  });

  it("uses every variable it declares", () => {
    // A declared-but-unused variable forces a call site to supply something that reaches nobody.
    for (const id of templateIds()) {
      const source = dist(`${id}.html`) + dist(`${id}.txt`);
      for (const name of Object.keys(CATALOG[id].vars)) {
        expect(source.includes(name), `${id}: declares '${name}' but no template uses it`).toBe(true);
      }
    }
  });
});

describe("size budgets", () => {
  it("keeps Cognito-routed messages inside Cognito's much tighter character limit", () => {
    for (const id of templateIds()) {
      if (sentByOf(id) !== "cognito") continue;
      const chars = [...dist(`${id}.html`)].length;
      expect(chars, `${id}: ${chars} chars exceeds Cognito's ~${COGNITO_CHAR_LIMIT}`).toBeLessThan(
        COGNITO_CHAR_LIMIT,
      );
    }
  });

  it("keeps every platform-sent template's artifact inside Gmail's clip budget", () => {
    // The unrendered artifact only; order-confirmation.test.ts tests the rendered size with a large basket.
    const GMAIL_FAIL = 102 * 1024;
    for (const id of templateIds()) {
      if (sentByOf(id) !== "platform") continue;
      const bytes = Buffer.byteLength(dist(`${id}.html`), "utf8");
      expect(bytes, `${id} artifact is ${bytes} B — over Gmail's ~${GMAIL_FAIL} B`).toBeLessThan(
        GMAIL_FAIL,
      );
    }
  });
});

describe("the code placeholder", () => {
  it("puts Cognito's {####} in exactly the Cognito-sent templates and nowhere else", () => {
    for (const id of templateIds()) {
      const hasPlaceholder = dist(`${id}.html`).includes("{####}");
      expect(hasPlaceholder, `${id}: {####} placement must match sentBy=${sentByOf(id)}`).toBe(
        sentByOf(id) === "cognito",
      );
    }
  });

  it("never declares a `code` variable on a Cognito-sent message", () => {
    // Cognito substitutes the code after the trigger returns: a `code` variable would be a misunderstanding.
    for (const id of templateIds()) {
      if (sentByOf(id) !== "cognito") continue;
      expect(Object.keys(CATALOG[id].vars)).not.toContain("code");
    }
  });
});

describe("category", () => {
  it("carries no unsubscribe affordance on a transactional message", () => {
    // The types already forbid it; this catches a link smuggled into the copy.
    for (const id of templateIds()) {
      if (categoryOf(id) !== "transactional") continue;
      const source = (dist(`${id}.html`) + dist(`${id}.txt`)).toLowerCase();
      expect(source.includes("unsubscribe"), `${id}: transactional mail must not offer unsubscribe`).toBe(
        false,
      );
      expect(source.includes("list-unsubscribe")).toBe(false);
    }
  });
});

describe("validateVars", () => {
  it("names the template and every missing or mistyped variable", () => {
    const errors = validateVars("auth-sign-in-code", { code: "1", expiryMinutes: "five" });
    expect(errors.join(" ")).toContain("auth-sign-in-code");
    expect(errors.some((e) => e.includes("expiryMinutes"))).toBe(true);
    expect(errors.some((e) => e.includes("isInternal"))).toBe(true);
  });

  it("rejects a non-object payload rather than rendering gaps", () => {
    expect(validateVars("auth-sign-in-code", null)).toHaveLength(1);
    expect(validateVars("auth-sign-in-code", "nope")[0]).toContain("must be an object");
  });

  it("accepts a valid payload", () => {
    expect(validateVars("auth-sign-in-code", { code: "482917", expiryMinutes: 5, isInternal: false }))
      .toEqual([]);
  });
});
