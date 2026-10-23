import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import type { MailIdentity } from "../src/audience.js";
import { CATALOG } from "../src/catalog.js";
import { render } from "../src/render.js";

/**
 * Store credit, said as store credit: never "refund", and nothing a staff member typed (there is no var
 * for the internal note).
 */

const here = dirname(fileURLToPath(import.meta.url));
const loadFixture = (name: string) => JSON.parse(readFileSync(resolve(here, "../src/fixtures", name), "utf8"));

const identity: MailIdentity = {
  sender: "Effy <no-reply@dev.effyshopping.com>",
  replyToPublic: "hello@effyshopping.com",
  replyToInternal: "workspace-admin@effyshopping.com",
  postalAddress: "1 Test St, Sydney NSW",
};

describe("074 — points emails", () => {
  it("points-credited states the points, their value, why and until when — in both parts", () => {
    const vars = loadFixture("points-credited.json");
    const out = render("points-credited", vars, "customer", identity);
    for (const part of [out.html, out.text]) {
      expect(part).toMatch(new RegExp(`${vars.points} (Effy )?points`));
      expect(part).toContain(`$${vars.valueAmount}`);
      expect(part).toContain(vars.reasonWords);
      expect(part).toContain(vars.expiresOn);
      expect(part.toLowerCase()).not.toContain("refund");
    }
    expect(out.subject).toBe(`You've received ${vars.points} Effy points`);
  });

  it("points-expiring names the last usable date and the value", () => {
    const vars = loadFixture("points-expiring.json");
    const out = render("points-expiring", vars, "customer", identity);
    for (const part of [out.html, out.text]) {
      expect(part).toContain(vars.expiresOn);
      expect(part).toContain(`$${vars.valueAmount}`);
    }
  });

  it("neither message has a var a staff note could travel in", () => {
    for (const id of ["points-credited", "points-expiring"] as const) {
      expect(Object.keys(CATALOG[id].vars).some((k) => /note|reason$|staff/i.test(k))).toBe(false);
    }
  });
});
