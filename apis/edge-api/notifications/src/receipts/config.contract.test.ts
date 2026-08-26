import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { MAIL_ENV_KEYS } from "@effy/email-kit/send";

/**
 * ⚠ THE DEPLOYMENT CONTRACT for the receipt drain (052 US3) — the same guard the feedback and
 * newsletter services carry, and it exists because of a specific, expensive defect.
 *
 * 035 read four environment variables that its `serverless.yml` never declared. Every pool resolved
 * "unknown", NO EMAIL WAS EVER SENT, and **100 passing tests missed it** — because the tests set those
 * variables themselves. A unit test that supplies its own configuration can never notice that the
 * configuration does not exist.
 *
 * So this test mocks nothing. It reads the ACTUAL `serverless.yml` and the ACTUAL service source and
 * asserts they agree. A missing MAIL_* key here means the receipt silently never sends.
 */

const here = dirname(fileURLToPath(import.meta.url));
const serviceRoot = resolve(here, "../..");

function readServerlessText(): string {
  return readFileSync(resolve(serviceRoot, "serverless.yml"), "utf8");
}

function readServerlessEnvKeys(): Set<string> {
  const yaml = readServerlessText();
  const start = yaml.indexOf("\n  environment:\n");
  if (start < 0) throw new Error("serverless.yml has no provider.environment block");
  const rest = yaml.slice(start + "\n  environment:\n".length);
  const end = rest.search(/\n {2}[a-z]/);
  const block = end < 0 ? rest : rest.slice(0, end);

  const keys = new Set<string>();
  for (const line of block.split("\n")) {
    const m = /^ {4}([A-Z][A-Z0-9_]*):/.exec(line);
    if (m?.[1]) keys.add(m[1]);
  }
  return keys;
}

/** Every `process.env.SOMETHING` the receipt slice reads. */
function readEnvKeysUsedBySource(): Set<string> {
  const keys = new Set<string>();
  for (const file of ["handler.ts", "sender.ts", "drain.ts", "repository.ts"]) {
    const source = readFileSync(resolve(here, file), "utf8");
    for (const m of source.matchAll(/\bprocess\.env\.([A-Z][A-Z0-9_]*)/g)) keys.add(m[1]!);
  }
  return keys;
}

describe("receipt drain deployment contract — serverless.yml declares what the code reads", () => {
  const declared = readServerlessEnvKeys();

  /**
   * ⚠ The list comes from email-kit's OWN export, self-checked there against the real source of
   * `config.ts` and `send.ts`. So it cannot silently drift from what the mail path actually reads —
   * which is the failure mode a hand-copied list would reintroduce.
   */
  it("declares every MAIL_* key the mail path reads", () => {
    for (const key of MAIL_ENV_KEYS) {
      expect(declared, `serverless.yml must declare ${key}`).toContain(key);
    }
  });

  it("declares every process.env key this slice reads", () => {
    for (const key of readEnvKeysUsedBySource()) {
      expect(declared, `serverless.yml must declare ${key}`).toContain(key);
    }
  });

  /** The receipt link would be broken without it — a receipt that cannot reach the order. */
  it("declares the storefront origin", () => {
    expect(declared).toContain("WEB_SITE_URL");
  });
});

describe("receipt drain deployment contract — the function and its permissions exist", () => {
  const yaml = readServerlessText();

  it("registers the scheduled receipt drain", () => {
    expect(yaml).toContain("receiptDrain:");
    expect(yaml).toContain("src/receipts/handler.handler");
    // A drain with no schedule never runs, and nothing else in the system would notice.
    const fn = yaml.slice(yaml.indexOf("receiptDrain:"));
    expect(fn.slice(0, fn.indexOf("\n  drain:") + 1 || undefined)).toContain("schedule:");
  });

  /**
   * ⚠ BOTH RESOURCES, OR THE SEND IS DENIED. `ses:SendEmail` authorizes against every resource the
   * request touches, and 037 made every send name a configuration set. Granting the identity alone
   * does not tighten the policy — it BREAKS it, silently, at send time. edge-auth and edge-customer
   * each shipped that defect; this asserts it cannot recur here.
   */
  it("grants ses:SendEmail on the identity AND the configuration set", () => {
    expect(yaml).toContain("ses:SendEmail");
    expect(yaml).toContain("/ses/identity_arn");
    expect(yaml).toContain("/ses/configuration_set_arn");
  });
});
