import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, resolve } from "node:path"
import { describe, expect, it } from "vitest"

import { MAIL_ENV_KEYS } from "@effy/email-kit"

/** Reads the real serverless.yml and source: the mail variables must be declared, as in auth's audience.config.test.ts. */

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
    // email-kit reads the mail environment; its exported list is self-checked against its source.
    const declared = readServerlessEnvKeys()

    expect(MAIL_ENV_KEYS.length).toBeGreaterThan(0)
    const missing = MAIL_ENV_KEYS.filter((k) => !declared.has(k))
    expect(missing, `serverless.yml is missing: ${missing.join(", ")}`).toEqual([])
  })

  it("⚠ notify.ts itself reads NO process.env — the env is email-kit's to read", () => {
    // No stray `process.env.MAIL_*` in notify.ts: a second, uncontracted reader.
    const used = readEnvKeysUsedBy("src/password/notify.ts")
    expect([...used], `notify.ts must not read env directly: ${[...used].join(", ")}`).toEqual([])
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
    // No hardcoded fallback address: it would keep the drift.
    const declared = readServerlessEnvKeys()
    expect(declared.has("NOTIFY_SENDER")).toBe(false)
  })

  it("⚠ grants ses:SendEmail on BOTH the identity and the configuration set, never on \"*\"", () => {
    // Scoped to the identity (never `*`), and the configuration set too: every send names one.
    const yaml = readFileSync(resolve(serviceRoot, "serverless.yml"), "utf8")
    const lines = yaml.split("\n").filter((l) => !/^\s*#/.test(l))

    const sesLine = lines.findIndex((l) => /Action:\s*ses:SendEmail/.test(l))
    expect(sesLine, "no ses:SendEmail statement found").toBeGreaterThanOrEqual(0)

    const block: string[] = []
    for (let i = sesLine + 1; i < lines.length; i++) {
      const line = lines[i] ?? ""
      if (block.length > 0 && !/^\s*-\s/.test(line)) break
      block.push(line)
      if (block.length === 1 && !/Resource:\s*$/.test(line)) break
    }
    const resources = block.join("\n")

    expect(resources).toMatch(/Resource:/)
    expect(resources, 'ses:SendEmail must not be granted on "*"').not.toMatch(/"\*"/)
    expect(resources, "must name this environment's identity").toContain("/ses/identity_arn")
    expect(
      resources,
      "must ALSO name the configuration set — a send that specifies one is authorized against both",
    ).toContain("/ses/configuration_set_arn")
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
