import { readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

import { describe, expect, it } from "vitest"

/**
 * ⚠ THE DEPLOYMENT CONTRACT for the home layout routes (042).
 *
 * This is the SIXTH time this platform has guarded the same defect — 027 R13, 029, 033, 035, 039, and
 * now here. In 035 an audience map read four environment variables `serverless.yml` never declared:
 * every pool resolved "unknown", **no email was ever sent**, and 100 passing tests missed it because
 * the tests set those variables themselves.
 *
 * A unit test that supplies its own configuration can never notice that the configuration does not
 * exist. So this one mocks nothing: it reads the ACTUAL `serverless.yml` and the ACTUAL source, and
 * asserts they agree.
 *
 * ⚠ THIS SLICE IS AN UNUSUALLY GOOD HOST FOR THAT DEFECT. A missing `STOREFRONT_BASE_URL` does not
 * crash anything and does not fail a publish — it means the storefront is never told to refresh. The
 * operator is told they published, the database says they published, the audit log says they
 * published, and shoppers see the old page for up to an hour. There is no error, anywhere, at any
 * point. `revalidate.ts` throws on the absence for exactly that reason; this test proves the absence
 * is not the deployed state.
 */

const here = dirname(fileURLToPath(import.meta.url))
const serviceRoot = resolve(here, "../..")
const yaml = readFileSync(resolve(serviceRoot, "serverless.yml"), "utf8")

function providerEnvKeys(): Set<string> {
  const marker = "\n  environment:\n"
  const start = yaml.indexOf(marker)
  if (start < 0) throw new Error("serverless.yml has no provider.environment block")
  const rest = yaml.slice(start + marker.length)
  const end = rest.search(/\n {2}[a-z]/)
  const block = end < 0 ? rest : rest.slice(0, end)

  const keys = new Set<string>()
  for (const line of block.split("\n")) {
    const m = /^ {4}([A-Z][A-Z0-9_]*):/.exec(line)
    if (m?.[1]) keys.add(m[1])
  }
  return keys
}

/** Every `process.env.X` this slice actually reads, discovered from source rather than listed here. */
function envKeysReadBySource(): Set<string> {
  const keys = new Set<string>()
  for (const file of ["revalidate.ts", "service.ts", "repository.ts", "authz.ts"]) {
    const src = readFileSync(resolve(here, file), "utf8")
    for (const m of src.matchAll(/process\.env\.([A-Z][A-Z0-9_]*)/g)) {
      if (m[1]) keys.add(m[1])
    }
  }
  return keys
}

describe("the home layout slice's environment is declared where it is deployed", () => {
  it("declares every variable the source reads", () => {
    const declared = providerEnvKeys()
    const read = envKeysReadBySource()
    // ⚠ Guards against the test itself going hollow: if the discovery regex ever stops finding
    // anything, an empty set trivially satisfies every assertion below and the guard is gone.
    expect(read.size).toBeGreaterThan(0)
    for (const key of read) {
      expect(declared, `${key} is read by the home layout slice but never declared`).toContain(key)
    }
  })

  it("declares the two revalidation variables by name", () => {
    // Named explicitly as well as discovered, because these two are the ones whose absence is
    // indistinguishable from success. A refactor that stopped reading them from these files would
    // satisfy the discovery test above by reading nothing at all.
    const declared = providerEnvKeys()
    expect(declared).toContain("STOREFRONT_BASE_URL")
    expect(declared).toContain("REVALIDATE_SECRET_ARN")
  })

  it("resolves both from the SSM contract rather than a literal", () => {
    // A hard-coded storefront address would work in dev and point every other environment's publish
    // at dev's cache. Region and addresses are configuration, never literals (constitution).
    expect(yaml).toMatch(/STOREFRONT_BASE_URL:\s*\$\{ssm:/)
    expect(yaml).toMatch(/REVALIDATE_SECRET_ARN:\s*\$\{ssm:/)
  })
})

describe("every home layout route is registered behind the back-office authorizer", () => {
  const expected = [
    { fn: "homeLayoutV1", method: "GET", path: "/admin/v1/home-layout" },
    { fn: "homeLayoutDraftV1", method: "PUT", path: "/admin/v1/home-layout/draft" },
    { fn: "homeLayoutPublishV1", method: "POST", path: "/admin/v1/home-layout/publish" },
    { fn: "homeLayoutRevertV1", method: "POST", path: "/admin/v1/home-layout/revert" },
    { fn: "homeLayoutAuditV1", method: "GET", path: "/admin/v1/home-layout/audit" },
  ]

  for (const { fn, method, path } of expected) {
    it(`${method} ${path} is declared`, () => {
      const block = functionBlock(fn)
      expect(block, `${fn} is not declared in serverless.yml`).toBeTruthy()
      expect(block).toContain(`method: ${method}`)
      expect(block).toContain(`path: ${path}`)
      // ⚠ An unauthenticated route here is not a leak of data — it is WRITE access to the front page
      // of the platform's only public surface, from the open internet.
      expect(block, `${fn} has no JWT authorizer`).toContain("type: jwt")
      expect(block).toContain("edge/authorizer/back-office_id")
    })
  }

  it("points every handler at a file that exists", () => {
    for (const { fn } of expected) {
      const m = /handler:\s*(\S+)\.handler/.exec(functionBlock(fn) ?? "")
      expect(m?.[1], `${fn} declares no handler path`).toBeTruthy()
      // A typo'd handler path deploys cleanly and 502s on the first call.
      expect(() => readFileSync(resolve(serviceRoot, `${m?.[1]}.ts`), "utf8")).not.toThrow()
    }
  })
})

function functionBlock(name: string): string | null {
  const start = yaml.indexOf(`\n  ${name}:\n`)
  if (start < 0) return null
  const rest = yaml.slice(start + 1)
  const end = rest.search(/\n {2}[a-zA-Z]/)
  return end < 0 ? rest : rest.slice(0, end)
}
