import { readdirSync, readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

import { describe, expect, it } from "vitest"

import { CATEGORY_ICON_FALLBACK, CATEGORY_ICONS } from "./category-icons"

const here = dirname(fileURLToPath(import.meta.url))
const fixtures = JSON.parse(readFileSync(resolve(here, "category-icons.fixtures.json"), "utf8")) as { icons: string[]; fallback: string }
const migrations = resolve(here, "../../../db/migrations")
const migration = readdirSync(migrations).find((f) => f.endsWith("_category_catalogue.sql"))

describe("category icons (101)", () => {
  it("the fixture is the list", () => {
    expect([...CATEGORY_ICONS]).toEqual(fixtures.icons)
    expect(CATEGORY_ICON_FALLBACK).toBe(fixtures.fallback)
  })

  it("the database CHECK names exactly these keys", () => {
    expect(migration, "no *_category_catalogue.sql migration").toBeDefined()
    const sql = readFileSync(resolve(migrations, migration!), "utf8")
    const check = /category_icon_check CHECK \(icon IS NULL OR icon IN \(([^)]*)\)\)/.exec(sql)
    expect(check, "category_icon_check not found").not.toBeNull()
    const keys = [...check![1]!.matchAll(/'([^']+)'/g)].map((m) => m[1])
    expect(keys).toEqual([...CATEGORY_ICONS])
  })

  it("every key is a Lucide icon name", () => {
    for (const key of CATEGORY_ICONS) expect(key).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/)
  })

  it("the customer app embeds the same fixture", () => {
    const kt = readFileSync(
      resolve(here, "../../../apps/customer-mobile/shared/src/commonTest/kotlin/com/effyshopping/customer/mobile/features/catalog/CategoryIconsFixture.kt"),
      "utf8",
    )
    expect(JSON.parse(kt.slice(kt.indexOf('"""') + 3, kt.lastIndexOf('"""')))).toEqual(fixtures)
  })
})
