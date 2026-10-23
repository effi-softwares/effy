import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";

/** Reads the real serverless.yml and source: tests that set their own env cannot catch an undeclared variable. */

const here = dirname(fileURLToPath(import.meta.url));
const serviceRoot = resolve(here, "../..");

function readServerlessEnvKeys(): Set<string> {
  const yaml = readFileSync(resolve(serviceRoot, "serverless.yml"), "utf8");

  // The `environment:` block under `provider:`, up to the next sibling key. Crude on purpose: no YAML dependency.
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

function readEnvKeysUsedBy(relativePath: string): Set<string> {
  const src = readFileSync(resolve(serviceRoot, relativePath), "utf8");
  const keys = new Set<string>();
  for (const m of src.matchAll(/process\.env\.([A-Z][A-Z0-9_]*)/g)) {
    if (m[1]) keys.add(m[1]);
  }
  return keys;
}

describe("deployment configuration", () => {
  it("⚠ declares EVERY environment variable the audience map reads", () => {
    const declared = readServerlessEnvKeys();
    const used = readEnvKeysUsedBy("src/lib/audience.ts");

    expect(used.size).toBeGreaterThan(0);
    const missing = [...used].filter((k) => !declared.has(k));
    expect(missing, `serverless.yml is missing: ${missing.join(", ")}`).toEqual([]);
  });

  it("declares every environment variable the whole service reads", () => {
    // AWS_SESSION_TOKEN is supplied by the Lambda runtime.
    const runtimeProvided = new Set(["AWS_SESSION_TOKEN", "AWS_REGION", "NODE_ENV"]);
    const declared = readServerlessEnvKeys();

    const used = new Set<string>();
    for (const f of [
      "src/lib/audience.ts",
      "src/lib/secret.ts",
      "src/otp/mailer.ts",
      "src/otp/issuance.ts",
    ]) {
      for (const k of readEnvKeysUsedBy(f)) used.add(k);
    }

    const missing = [...used].filter((k) => !declared.has(k) && !runtimeProvided.has(k));
    expect(missing, `serverless.yml is missing: ${missing.join(", ")}`).toEqual([]);
  });

  it("⚠ maps all FOUR audiences — a missing pool is a silent lockout for that audience", () => {
    const declared = readServerlessEnvKeys();
    for (const key of [
      "CUSTOMER_USER_POOL_ID",
      "DRIVER_USER_POOL_ID",
      "SHOP_USER_POOL_ID",
      "BACK_OFFICE_USER_POOL_ID",
    ]) {
      expect(declared.has(key), `serverless.yml must declare ${key}`).toBe(true);
    }
  });

  it("⚠ declares the three mail-contract variables, and resolves each from SSM (037)", () => {
    // The sender comes from the /effy/<env>/ses/* contract.
    const yaml = readFileSync(resolve(serviceRoot, "serverless.yml"), "utf8");
    const declared = readServerlessEnvKeys();

    for (const key of ["MAIL_SENDER", "MAIL_REPLY_TO", "MAIL_CONFIGURATION_SET"]) {
      expect(declared.has(key), `serverless.yml must declare ${key}`).toBe(true);

      const line = yaml.split("\n").find((l) => new RegExp(`^\\s*${key}:`).test(l));
      expect(line, `${key} is not declared`).toBeDefined();

      // It must come from SSM, not a hardcoded value.
      expect(line, `${key} must resolve from the /effy/<env>/ses/* contract, not a literal`).toMatch(
        /\$\{ssm:\/effy\/\$\{sls:stage\}\/ses\/[a-z_]+\}/,
      );
    }
  });

  it("⚠ no longer declares the retired OTP_SENDER — a fallback would preserve the drift", () => {
    // No old name beside the new one: two sources for one address.
    const declared = readServerlessEnvKeys();
    expect(declared.has("OTP_SENDER"), "OTP_SENDER must be removed, not kept as a fallback").toBe(
      false,
    );
  });

  it("⚠ hardcodes no sender address anywhere in the deployment config", () => {
    // Comments are stripped first, so prose naming the retired literal does not fail it.
    const yaml = readFileSync(resolve(serviceRoot, "serverless.yml"), "utf8");
    const config = yaml
      .split("\n")
      .filter((l) => !/^\s*#/.test(l))
      .join("\n");

    expect(config).not.toMatch(/no-reply@/);
  });

  it("⚠ grants ses:SendEmail on BOTH the identity and the configuration set", () => {
    // ses:SendEmail authorizes every resource the request touches: the identity and the configuration
    // set. Naming only the identity failed every send, and a failed send is a failed sign-in.
    const yaml = readFileSync(resolve(serviceRoot, "serverless.yml"), "utf8");
    const lines = yaml.split("\n").filter((l) => !/^\s*#/.test(l));

    const sesLine = lines.findIndex((l) => /Action:\s*ses:SendEmail/.test(l));
    expect(sesLine, "no ses:SendEmail statement found").toBeGreaterThanOrEqual(0);

    const block: string[] = [];
    for (let i = sesLine + 1; i < lines.length; i++) {
      const line = lines[i] ?? "";
      if (block.length > 0 && !/^\s*-\s/.test(line)) break;
      block.push(line);
      if (block.length === 1 && !/Resource:\s*$/.test(line)) break;
    }
    const resources = block.join("\n");

    expect(resources).toMatch(/Resource:/);
    expect(resources, 'ses:SendEmail must not be granted on "*"').not.toMatch(/"\*"/);
    expect(resources, "must name this environment's identity").toContain("/ses/identity_arn");
    expect(
      resources,
      "must ALSO name the configuration set — a send that specifies one is authorized against both",
    ).toContain("/ses/configuration_set_arn");
  });

  it("⚠ uses the HYPHENATED back-office SSM path", () => {
    // The SSM path is back-office, not back_office; checked on the declaration line only.
    const yaml = readFileSync(resolve(serviceRoot, "serverless.yml"), "utf8");
    const line = yaml
      .split("\n")
      .find((l) => /^\s*BACK_OFFICE_USER_POOL_ID:/.test(l));

    expect(line, "BACK_OFFICE_USER_POOL_ID is not declared").toBeDefined();
    expect(line).toContain("/auth/back-office/user_pool_id");
    expect(line).not.toContain("back_office");
  });
});
