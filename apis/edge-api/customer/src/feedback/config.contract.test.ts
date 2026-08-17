import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, resolve } from "node:path"
import { describe, expect, it } from "vitest"

import { MAIL_ENV_KEYS } from "@effy/email-kit/send"

/**
 * ⚠ THE DEPLOYMENT CONTRACT for the feedback routes (046 US1) — the same guard as the newsletter's
 * (035 R13 / 038). A unit test that supplies its own configuration can never notice the configuration
 * does not exist, so this one mocks nothing: it reads the ACTUAL `serverless.yml` and the ACTUAL
 * service source and asserts they agree. A missing FEEDBACK_RATE_* key would silently disable the
 * abuse resistance; a missing MAIL_* key would silently kill the thank-you email.
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

/** Every `env.SOMETHING` the feedback service reads. */
function readEnvKeysUsedBySource(): Set<string> {
  const source = readFileSync(resolve(here, "service.ts"), "utf8")
  const keys = new Set<string>()
  for (const m of source.matchAll(/\benv\.([A-Z][A-Z0-9_]*)/g)) keys.add(m[1]!)
  return keys
}

describe("feedback deployment contract — serverless.yml declares what the code reads", () => {
  const declared = readServerlessEnvKeys()

  it("declares every environment variable the feedback service reads", () => {
    const used = readEnvKeysUsedBySource()
    expect(used.size, "the service reads no env at all — did the parser break?").toBeGreaterThan(0)
    const missing = [...used].filter((k) => !declared.has(k))
    expect(missing, `serverless.yml is missing: ${missing.join(", ")}`).toEqual([])
  })

  it("declares every MAIL_* key email-kit requires to send the thank-you", () => {
    const missing = MAIL_ENV_KEYS.filter((k) => !declared.has(k))
    expect(missing, `serverless.yml is missing: ${missing.join(", ")}`).toEqual([])
  })

  it("declares the feedback rate-limit keys by name", () => {
    for (const key of ["FEEDBACK_RATE_WINDOW_MINUTES", "FEEDBACK_RATE_MAX", "FEEDBACK_SOURCE_SALT"]) {
      expect(declared.has(key), `serverless.yml does not declare ${key}`).toBe(true)
    }
  })
})

describe("feedback routes — the authed/public split is intentional and stays that way", () => {
  const yaml = readFileSync(resolve(serviceRoot, "serverless.yml"), "utf8")

  function blockFor(fn: string): string {
    const start = yaml.indexOf(`  ${fn}:`)
    expect(start, `${fn} is not declared in serverless.yml`).toBeGreaterThan(-1)
    const rest = yaml.slice(start + fn.length)
    // ⚠ Stop at the next 2-space line that is a function OR a comment — a naive `[a-zA-Z]`-only
    // boundary overruns through a comment block into the NEXT function and reads its authorizer.
    const end = rest.search(/\n {2}(?:[A-Za-z]|#)/)
    return end < 0 ? rest : rest.slice(0, end)
  }

  it("puts the signed-in route behind the customer authorizer", () => {
    expect(blockFor("customerFeedbackV1Post")).toContain("authorizer")
  })

  /**
   * ⚠ The guest route must stay public. An `authorizer` here would 401 every guest — the failure would
   * look like a frontend bug because the page renders fine.
   */
  it("attaches no authorizer to the public route", () => {
    expect(blockFor("customerFeedbackPublicV1Post")).not.toContain("authorizer")
  })

  it("registers both routes at the paths the clients call", () => {
    expect(yaml).toContain("path: /customer/v1/feedback\n")
    expect(yaml).toContain("path: /customer/v1/feedback/public")
  })
})
