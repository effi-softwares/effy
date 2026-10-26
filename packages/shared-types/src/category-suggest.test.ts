import { readdirSync, readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

import { describe, expect, it } from "vitest"

import { searchLeaves, singular, suggestCategories, tokens, type SuggestLeaf } from "./category-suggest"

const here = dirname(fileURLToPath(import.meta.url))
const fixtures = JSON.parse(readFileSync(resolve(here, "../category-suggest.fixtures.json"), "utf8")) as { cases: { name: string; leaf: string }[] }

/** The seeded tree, read from the migration that seeds it (one source): leaves by key, with paths and synonyms. */
function seededLeaves(): { leaves: SuggestLeaf[]; departments: string[] } {
  const dir = resolve(here, "../../../db/migrations")
  const file = readdirSync(dir).find((f) => f.endsWith("_catalogue_taxonomy.sql"))!
  const sql = readFileSync(resolve(dir, file), "utf8")
  const row = /^\s+\('([^']+)', (NULL|'[^']+'), \d, '((?:[^']|'')+)', \d+, (?:NULL|'[^']+'), (?:ARRAY\[([^\]]*)\]|'\{\}')::text\[\]/gm
  const rows = [...sql.matchAll(row)].map((m) => ({
    key: m[1]!,
    parent: m[2] === "NULL" ? null : m[2]!.slice(1, -1),
    name: m[3]!.replace(/''/g, "'"),
    synonyms: [...(m[4] ?? "").matchAll(/'((?:[^']|'')+)'/g)].map((x) => x[1]!.replace(/''/g, "'")),
  }))
  const byKey = new Map(rows.map((r) => [r.key, r]))
  const parents = new Set(rows.map((r) => r.parent))
  const path = (k: string): string[] => {
    const r = byKey.get(k)!
    return r.parent ? [...path(r.parent), r.name] : [r.name]
  }
  return {
    leaves: rows.filter((r) => !parents.has(r.key)).map((r) => ({ id: r.key, name: r.name, path: path(r.key), synonyms: r.synonyms })),
    departments: rows.filter((r) => r.parent === null).map((r) => r.name),
  }
}

const { leaves, departments } = seededLeaves()

describe("category suggestions (101, R11)", () => {
  it("reads the whole seeded tree", () => {
    expect(leaves.length).toBe(583)
    expect(departments).toHaveLength(25)
  })

  it("the fixtures name real leaves and cover every department, at least 60 products", () => {
    const byId = new Map(leaves.map((l) => [l.id, l]))
    expect(fixtures.cases.length).toBeGreaterThanOrEqual(60)
    for (const c of fixtures.cases) expect(byId.has(c.leaf), `${c.leaf} is not a seeded leaf`).toBe(true)
    expect(new Set(fixtures.cases.map((c) => byId.get(c.leaf)!.path[0])).size).toBe(25)
  })

  it.each(fixtures.cases.map((c) => [c.name, c.leaf] as const))("%s → %s first", (name, leaf) => {
    expect(suggestCategories(name, leaves)[0]?.id).toBe(leaf)
  })

  it("returns at most `limit` leaves, and nothing for a name that matches nothing", () => {
    expect(suggestCategories("Greek Yoghurt", leaves).length).toBeLessThanOrEqual(5)
    expect(suggestCategories("Greek Yoghurt", leaves, 2)).toHaveLength(2)
    expect(suggestCategories("", leaves)).toEqual([])
    expect(suggestCategories("500g 2 pack", leaves)).toEqual([])
    expect(suggestCategories("Zxqv Wombat", leaves)).toEqual([])
  })

  it("a leaf-name or synonym hit outranks a department-name hit; ties go to the deeper leaf, then the name", () => {
    const mini: SuggestLeaf[] = [
      { id: "dept-hit", name: "Other Things", path: ["Pet", "Other Things"], synonyms: [] },
      { id: "syn-hit", name: "Kibble", path: ["Pet", "Dog", "Kibble"], synonyms: ["dog biscuit"] },
      { id: "b", name: "Biscuit", path: ["Pantry", "Biscuit"], synonyms: [] },
      { id: "a", name: "Biscuit", path: ["Snacks", "Sweet", "Biscuit"], synonyms: [] },
    ]
    expect(suggestCategories("Pet dog biscuit", mini).map((l) => l.id)).toEqual(["syn-hit", "a", "b"])
  })

  it("words: lower case, singular, accents folded, no numbers, units or filler", () => {
    expect(tokens("Strawberries 250g Punnet & Cherry Tomatoes x 2")).toEqual(["strawberry", "punnet", "cherry", "tomato"])
    expect(tokens("Pâté")).toEqual(["pate"])
    expect(["berries", "tomatoes", "boxes", "oats", "glass", "citrus", "hummus"].map(singular)).toEqual(["berry", "tomato", "box", "oat", "glass", "citrus", "hummus"])
  })

  it("search matches every typed word (or its start) across the path and synonyms, leaves only", () => {
    const found = searchLeaves("dairy yog", leaves).map((l) => l.id)
    expect(found).toContain("greek-and-natural-yoghurt")
    expect(found.every((id) => leaves.some((l) => l.id === id))).toBe(true)
    expect(searchLeaves("charger", leaves).map((l) => l.id)).toContain("chargers-and-cables")
    expect(searchLeaves("  ", leaves)).toEqual([])
  })
})
