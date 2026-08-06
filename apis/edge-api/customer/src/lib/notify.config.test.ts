import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, resolve } from "node:path"
import { describe, expect, it } from "vitest"

/**
 * ⚠ THE DEPLOYMENT CONTRACT for edge-customer (037).
 *
 * This service has never had one, and it sends mail. The failure it guards against has now happened
 * FOUR times on this platform — 027 R13, 029, 033, and 035, where an audience map read four
 * environment variables `serverless.yml` never declared: every pool resolved "unknown", no email was
 * ever sent, and **100 passing tests missed it because they set those variables themselves**.
 *
 * A unit test that mocks its own configuration can never notice that the configuration does not
 * exist. So this test mocks nothing: it reads the ACTUAL `serverless.yml` and the ACTUAL source and
 * asserts they agree.
 *
 * Mirrors `apis/edge-api/auth/src/lib/audience.config.test.ts` on purpose — the same defect deserves
 * the same shape of guard, not a bespoke one.
 */

const here = dirname(fileURLToPath(import.meta.url))
const serviceRoot = resolve(here, "../..")

function readServerlessEnvKeys(): Set<string> {
  const yaml = readFileSync(resolve(serviceRoot, "serverless.yml"), "utf8")

  const start = yaml.indexOf("\n  environment:\n")
  if (start < 0) throw new Error("serverless.yml has no provider.environment block")
  const rest = yaml.slice(start + "\n  environment:\n".length)
  const end = rest.search(/\n {2}[a-z]/)
  const block = end < 0 ? rest : rest.slice(0, end)

  const keys = new Set<string>()
  for (const line of block.split("\n")) {
    const m = /^ {4}([A-Z][A-Z0-9_]*):/.exec(line)
    if (m?.[1]) keys.add(m[1])
  }
  return keys
}

function readEnvKeysUsedBy(relativePath: string): Set<string> {
  const src = readFileSync(resolve(serviceRoot, relativePath), "utf8")
  const keys = new Set<string>()
  for (const m of src.matchAll(/process\.env\.([A-Z][A-Z0-9_]*)/g)) {
    if (m[1]) keys.add(m[1])
  }
  return keys
}

describe("deployment configuration", () => {
  it("⚠ declares every environment variable the mail path reads", () => {
    const declared = readServerlessEnvKeys()
    const used = readEnvKeysUsedBy("src/password/notify.ts")

    expect(used.size).toBeGreaterThan(0) // guard: a refactor must not make this test vacuous
    const missing = [...used].filter((k) => !declared.has(k))
    expect(missing, `serverless.yml is missing: ${missing.join(", ")}`).toEqual([])
  })

  it("⚠ resolves the mail contract from SSM, not from a literal (037)", () => {
    const yaml = readFileSync(resolve(serviceRoot, "serverless.yml"), "utf8")
    const declared = readServerlessEnvKeys()

    for (const key of ["MAIL_SENDER", "MAIL_REPLY_TO", "MAIL_CONFIGURATION_SET"]) {
      expect(declared.has(key), `serverless.yml must declare ${key}`).toBe(true)

      const line = yaml.split("\n").find((l) => new RegExp(`^\\s*${key}:`).test(l))
      expect(line, `${key} is not declared`).toBeDefined()
      expect(line, `${key} must come from /effy/<env>/ses/*`).toMatch(
        /\$\{ssm:\/effy\/\$\{sls:stage\}\/ses\/[a-z_]+\}/,
      )
    }
  })

  it("⚠ no longer declares the retired NOTIFY_SENDER", () => {
    // It was a second hardcoded copy of the same address edge-auth hardcoded, while Terraform
    // published a third in a different shape. Keeping it as a fallback preserves the drift.
    const declared = readServerlessEnvKeys()
    expect(declared.has("NOTIFY_SENDER")).toBe(false)
  })

  it("⚠ scopes ses:SendEmail to this environment's identity, never to \"*\" (037 FR-043)", () => {
    // The grant was `Resource: "*"` — permission to send as ANY verified identity in the account,
    // including the future production one. edge-auth's own comment called it out and declined to
    // copy it; nobody fixed it until 037. This test is what stops it coming back.
    const yaml = readFileSync(resolve(serviceRoot, "serverless.yml"), "utf8")
    const lines = yaml.split("\n").filter((l) => !/^\s*#/.test(l))

    const sesLine = lines.findIndex((l) => /Action:\s*ses:SendEmail/.test(l))
    expect(sesLine, "no ses:SendEmail statement found").toBeGreaterThanOrEqual(0)

    const resource = lines[sesLine + 1] ?? ""
    expect(resource).toMatch(/Resource:/)
    expect(resource, "ses:SendEmail must not be granted on \"*\"").not.toMatch(/"\*"/)
    expect(resource).toContain("/ses/identity_arn")
  })

  it("⚠ hardcodes no sender address anywhere in the deployment config", () => {
    const yaml = readFileSync(resolve(serviceRoot, "serverless.yml"), "utf8")
    const config = yaml
      .split("\n")
      .filter((l) => !/^\s*#/.test(l))
      .join("\n")

    expect(config).not.toMatch(/no-reply@/)
  })
})
