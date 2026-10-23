import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { MAIL_ENV_KEYS } from "@effy/email-kit/send";

/** Reads the real serverless.yml: it must declare every variable email-kit reads. */

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
    expect(MAIL_ENV_KEYS.length).toBeGreaterThan(0);
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

  it("⚠ resolves the postal address from the SSM mail contract", () => {
    const yaml = readFileSync(resolve(serviceRoot, "serverless.yml"), "utf8");
    const line = yaml.split("\n").find((l) => /^\s*MAIL_POSTAL_ADDRESS:/.test(l));
    expect(line, "MAIL_POSTAL_ADDRESS is not declared").toBeDefined();
    expect(line, "MAIL_POSTAL_ADDRESS must come from /effy/<env>/mail/*").toMatch(
      /\$\{ssm:\/effy\/\$\{sls:stage\}\/mail\/[a-z_]+/,
    );
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
