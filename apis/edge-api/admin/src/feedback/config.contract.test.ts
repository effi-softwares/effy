import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, resolve } from "node:path"
import { describe, expect, it } from "vitest"

import { MAIL_ENV_KEYS } from "@effy/email-kit/send"

/**
 * ⚠ THE DEPLOYMENT CONTRACT for the feedback console (046 US2/US3) — the 035/038 guard. The reply
 * emails the submitter through email-kit, which reads the MAIL_* keys; a missing one would silently
 * kill every reply while every unit test (which sets its own env) passed. So this reads the ACTUAL
 * `serverless.yml` and asserts it declares what a live reply needs, and that every route is behind the
 * back-office authorizer.
 */

const here = dirname(fileURLToPath(import.meta.url))
const serviceRoot = resolve(here, "../..")
const yaml = readFileSync(resolve(serviceRoot, "serverless.yml"), "utf8")

function readServerlessEnvKeys(): Set<string> {
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

describe("feedback console deployment contract", () => {
  const declared = readServerlessEnvKeys()

  it("declares every MAIL_* key email-kit needs to send a reply", () => {
    const missing = MAIL_ENV_KEYS.filter((k) => !declared.has(k))
    expect(missing, `serverless.yml is missing: ${missing.join(", ")}`).toEqual([])
  })

  it("registers all five feedback routes behind the back-office authorizer", () => {
    const fns = ["feedbackListV1", "feedbackDetailV1", "feedbackStatusV1", "feedbackNoteV1", "feedbackReplyV1"]
    for (const fn of fns) {
      const start = yaml.indexOf(`  ${fn}:`)
      expect(start, `${fn} is not declared in serverless.yml`).toBeGreaterThan(-1)
      const rest = yaml.slice(start + fn.length)
      const end = rest.search(/\n {2}(?:[A-Za-z]|#)/)
      const block = end < 0 ? rest : rest.slice(0, end)
      expect(block, `${fn} must be behind the back-office authorizer`).toContain(
        "authorizer/back-office_id",
      )
    }
  })

  it("wires the paths the console calls, including the reply route", () => {
    expect(yaml).toContain("path: /admin/v1/feedback\n")
    expect(yaml).toContain("path: /admin/v1/feedback/{referenceCode}")
    expect(yaml).toContain("path: /admin/v1/feedback/{referenceCode}/status")
    expect(yaml).toContain("path: /admin/v1/feedback/{referenceCode}/notes")
    expect(yaml).toContain("path: /admin/v1/feedback/{referenceCode}/reply")
  })

  it("grants ses:SendEmail (identity + configuration set) for the reply", () => {
    expect(yaml).toContain("ses:SendEmail")
    expect(yaml).toContain("ses/configuration_set_arn")
  })
})
