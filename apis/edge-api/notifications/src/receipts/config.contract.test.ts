import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { MAIL_ENV_KEYS } from "@effy/email-kit/send";

/** Reads the real serverless.yml and source: a missing MAIL_* key means receipts silently never send. */

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

  /** From email-kit's own export, self-checked against the mail path's source. */
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

  /** Without it the receipt's order link would be broken. */
  it("declares the storefront origin", () => {
    expect(declared).toContain("WEB_SITE_URL");
  });
});

describe("receipt drain deployment contract — the function and its permissions exist", () => {
  const yaml = readServerlessText();

  it("registers the scheduled receipt drain", () => {
    expect(yaml).toContain("receiptDrain:");
    expect(yaml).toContain("src/receipts/handler.handler");
    // A drain with no schedule never runs.
    const fn = yaml.slice(yaml.indexOf("receiptDrain:"));
    expect(fn.slice(0, fn.indexOf("\n  drain:") + 1 || undefined)).toContain("schedule:");
  });

  /** Both resources: every send names a configuration set, so granting the identity alone denies it. */
  it("grants ses:SendEmail on the identity AND the configuration set", () => {
    expect(yaml).toContain("ses:SendEmail");
    expect(yaml).toContain("/ses/identity_arn");
    expect(yaml).toContain("/ses/configuration_set_arn");
  });
});
