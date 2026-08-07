import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { MAIL_ENV_KEYS } from "@effy/email-kit/send";

/**
 * ⚠ THE MAIL DEPLOYMENT CONTRACT for edge-auth (038).
 *
 * The sign-in code — the only credential three of four audiences have — is now sent through
 * `@effy/email-kit/send`, which reads its configuration from the environment. This test reads the
 * ACTUAL `serverless.yml` and asserts it declares every variable email-kit reads.
 *
 * This is the FIFTH guard of one recurring defect (027 R13 → 029 → 033 → 035). In 035 an audience
 * map read four variables `serverless.yml` never declared: every pool resolved "unknown", no email
 * was ever sent, and 100 passing tests missed it because they set the variables themselves. A unit
 * test that supplies its own configuration can never notice the configuration does not exist — so
 * this test mocks nothing and reads the real files. Mirrors `audience.config.test.ts` on purpose.
 */

const here = dirname(fileURLToPath(import.meta.url));
const serviceRoot = resolve(here, "..", "..");

function readServerlessEnvKeys(): Set<string> {
  const yaml = readFileSync(resolve(serviceRoot, "serverless.yml"), "utf8");
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

describe("mail deployment configuration", () => {
  it("⚠ declares every environment variable email-kit's send path reads", () => {
    const declared = readServerlessEnvKeys();
    expect(MAIL_ENV_KEYS.length).toBeGreaterThan(0); // never vacuous
    const missing = MAIL_ENV_KEYS.filter((k) => !declared.has(k));
    expect(missing, `serverless.yml is missing: ${missing.join(", ")}`).toEqual([]);
  });

  it("⚠ resolves sender, reply and configuration set from SSM, not from a literal (037)", () => {
    const yaml = readFileSync(resolve(serviceRoot, "serverless.yml"), "utf8");
    for (const key of ["MAIL_SENDER", "MAIL_REPLY_TO", "MAIL_CONFIGURATION_SET"]) {
      const line = yaml.split("\n").find((l) => new RegExp(`^\\s*${key}:`).test(l));
      expect(line, `${key} is not declared`).toBeDefined();
      expect(line, `${key} must come from /effy/<env>/ses/*`).toMatch(
        /\$\{ssm:\/effy\/\$\{sls:stage\}\/ses\/[a-z_]+\}/,
      );
    }
  });

  it("⚠ resolves the non-production allowlist and postal address from the SSM mail contract", () => {
    const yaml = readFileSync(resolve(serviceRoot, "serverless.yml"), "utf8");
    for (const key of ["MAIL_NONPROD_ALLOWLIST", "MAIL_POSTAL_ADDRESS"]) {
      const line = yaml.split("\n").find((l) => new RegExp(`^\\s*${key}:`).test(l));
      expect(line, `${key} is not declared`).toBeDefined();
      expect(line, `${key} must come from /effy/<env>/mail/*`).toMatch(
        /\$\{ssm:\/effy\/\$\{sls:stage\}\/mail\/[a-z_]+/,
      );
    }
  });

  it("⚠ hardcodes no sender address anywhere in the deployment config", () => {
    const yaml = readFileSync(resolve(serviceRoot, "serverless.yml"), "utf8");
    const config = yaml
      .split("\n")
      .filter((l) => !/^\s*#/.test(l))
      .join("\n");
    expect(config).not.toMatch(/no-reply@/);
  });
});
