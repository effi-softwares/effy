import { existsSync, readdirSync, readFileSync, statSync } from "node:fs"
import { dirname, join, relative, resolve } from "node:path"

import { describe, expect, it } from "vitest"

import type { TourDef } from "@effy/web-kit/tour"

import { SHOP_TOURS } from "./tours"

/**
 * 106 FR-001 / FR-019 / SC-001: every page of the shop console has a tour, and no step points at nothing.
 *
 * (1) Every routed screen calls `useTourPage(` - followed from the route through its screen and the components that
 *     screen renders (one wrapper deep: Team's route renders ManagerOnlyScreen, which renders TeamRoster).
 * (2) Every tour is some page's (or is the whole-console Welcome tour).
 * (3) Every step's `data-tour` key exists in the source.
 * (4) The page-level keys a tour names (`page-more`, `page-title`, `page-activity`) exist on THAT tour's own screen.
 */

const SRC = resolve(__dirname, "../..")
const WEB_KIT = resolve(__dirname, "../../../../../packages/web-kit/src")

function* files(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry.startsWith(".") || entry === "__tests__") continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) yield* files(full)
    else if (/\.(ts|tsx)$/.test(entry) && !/\.test\.tsx?$/.test(entry)) yield full
  }
}

const read = (f: string) => readFileSync(f, "utf8")
const shopFiles = [...files(SRC)].filter((f) => !f.includes("/features/tours/"))
const kitFiles = [...files(WEB_KIT)]
const allText = [...shopFiles, ...kitFiles].map(read).join("\n")

/** "@/features/x/Y" or "./Y" from `from`, to a file on disk. */
function resolveModule(spec: string, from: string): string | null {
  const base = spec.startsWith("@/")
    ? join(SRC, spec.slice(2))
    : spec.startsWith(".")
      ? resolve(dirname(from), spec)
      : null
  if (!base) return null
  for (const candidate of [`${base}.tsx`, `${base}.ts`, join(base, "index.ts"), join(base, "index.tsx")]) {
    if (existsSync(candidate)) return candidate
  }
  return null
}

/** The modules a file imports from the app (not packages). */
function appImports(file: string): Map<string, string> {
  const out = new Map<string, string>()
  const text = read(file)
  for (const m of text.matchAll(/import\s+(?:type\s+)?\{([^}]*)\}\s+from\s+"([^"]+)"/g)) {
    const target = resolveModule(m[2]!, file)
    if (!target) continue
    for (const name of m[1]!.split(",").map(
      (n) =>
        n
          .trim()
          .replace(/^type\s+/, "")
          .split(/\s+as\s+/)
          .pop()!,
    )) {
      if (name) out.set(name, target)
    }
  }
  return out
}

/** The components a route renders: `component: X`, `component: () => <X …`, or a local wrapper's JSX. */
function routeScreens(routeFile: string): { path: string; files: Set<string> }[] {
  const text = read(routeFile)
  const imports = appImports(routeFile)
  const routes: { path: string; files: Set<string> }[] = []
  const defs = [...text.matchAll(/createRoute\(\{([\s\S]*?)\n\}\)/g)]
  for (const def of defs) {
    const body = def[1]!
    const path = /path:\s*"([^"]*)"/.exec(body)?.[1] ?? /id:\s*"([^"]*)"/.exec(body)?.[1] ?? "?"
    const component = /component:\s*(?:\(\)\s*=>\s*<)?(\w+)/.exec(body)?.[1]
    if (!component) continue
    const reached = new Set<string>()
    const visit = (name: string, depth: number) => {
      const target = imports.get(name)
      if (target) {
        reached.add(target)
        if (depth > 0) for (const t of appImports(target).values()) reached.add(t)
        return
      }
      // A component defined in the route file: what it renders.
      const local = new RegExp(`function ${name}\\b[\\s\\S]*?\\n\\}`).exec(text)?.[0] ?? ""
      for (const jsx of local.matchAll(/<([A-Z]\w*)/g)) if (imports.has(jsx[1]!)) visit(jsx[1]!, depth)
    }
    visit(component, 1)
    routes.push({ path, files: reached })
  }
  return routes
}

const routeFiles = readdirSync(join(SRC, "routes"))
  .filter((f) => f.endsWith(".tsx") && f !== "auth.tsx" && f !== "__root.tsx")
  .map((f) => join(SRC, "routes", f))

const pages = routeFiles
  .flatMap(routeScreens)
  // The shell itself (the protected layout) is not a page.
  .filter((r) => r.path !== "protected")

const TOUR_PAGE_CALL = /useTourPage\(\s*([\s\S]*?),\s*\{/g

function tourKeysIn(text: string): string[] {
  const keys: string[] = []
  for (const m of text.matchAll(TOUR_PAGE_CALL)) {
    const arg = m[1]!
    // String literals that are a result, not the left of a comparison (`view === "table" ? "a" : "b"`).
    for (const lit of arg.matchAll(/(?<![=!]==\s*)"([a-z0-9-]+)"/g)) keys.push(lit[1]!)
    for (const tpl of arg.matchAll(/`([a-z0-9-]+)-\$\{/g)) keys.push(`${tpl[1]}-*`)
  }
  return keys
}

const keyMatches = (pattern: string, key: string) =>
  pattern.endsWith("-*") ? key.startsWith(pattern.slice(0, -1)) : pattern === key

const navKeys = [...read(join(SRC, "components/layout/nav.ts")).matchAll(/key:\s*"([^"]+)"/g)].map((m) => m[1]!)

/** Keys web-kit derives rather than writes out. */
function derivedKeyExists(key: string): boolean {
  if (key === "nav") return true
  if (key.startsWith("nav.")) return navKeys.includes(key.slice(4))
  if (key.startsWith("list.col.")) {
    const id = key.slice("list.col.".length)
    return new RegExp(`(id|accessorKey):\\s*"${id}"`).test(allText)
  }
  return false
}

const targetKeys = (tour: TourDef) =>
  tour.steps.flatMap((s) => (s.target === null ? [] : typeof s.target === "string" ? [s.target] : [...s.target]))

describe("106 - every shop console page has a tour, and every tour points at something", () => {
  it("found the routes (the guard must not pass vacuously)", () => {
    expect(pages.length).toBeGreaterThanOrEqual(14)
  })

  it.each(pages.map((p) => [p.path, p] as const))("route %s registers a tour of the console's", (_path, page) => {
    const keys = [...page.files].flatMap((f) => tourKeysIn(read(f)))
    expect(
      keys.length,
      `no useTourPage( in ${[...page.files].map((f) => relative(SRC, f)).join(", ")}`,
    ).toBeGreaterThan(0)
    for (const k of keys)
      expect(
        SHOP_TOURS.some((t) => keyMatches(k, t.key)),
        `unknown tour key ${k}`,
      ).toBe(true)
  })

  it("every tour is some page's, or the whole-console tour", () => {
    const used = pages.flatMap((p) => [...p.files].flatMap((f) => tourKeysIn(read(f))))
    const orphans = SHOP_TOURS.filter((t) => !t.anyPage && !used.some((k) => keyMatches(k, t.key))).map((t) => t.key)
    expect(orphans).toEqual([])
  })

  it("defines all sixteen tours of the spec's inventory", () => {
    expect(SHOP_TOURS.length).toBe(16)
  })

  it("every step's target exists in the source", () => {
    const missing: string[] = []
    for (const tour of SHOP_TOURS) {
      for (const key of targetKeys(tour)) {
        const written = allText.includes(`"${key}"`)
        if (!written && !derivedKeyExists(key)) missing.push(`${tour.key}: ${key}`)
      }
    }
    expect(missing).toEqual([])
  })

  it("the page-level keys a tour names are on that tour's own screen", () => {
    const wrong: string[] = []
    for (const tour of SHOP_TOURS.filter((t) => !t.anyPage)) {
      const screen = pages.find((p) =>
        [...p.files].some((f) => tourKeysIn(read(f)).some((k) => keyMatches(k, tour.key))),
      )
      if (!screen) continue
      // The screen's files and the components they import, one more level (sections, actions).
      const set = new Set(screen.files)
      for (const f of screen.files) for (const t of appImports(f).values()) set.add(t)
      const text = [...set].map(read).join("\n")
      const keys = targetKeys(tour)
      if (keys.includes("page-more") && !text.includes(`tour="page-more"`)) wrong.push(`${tour.key}: page-more`)
      if (keys.includes("page-title") && !/<(PageHeader|RecordHeader)\b/.test(text))
        wrong.push(`${tour.key}: page-title`)
      if (keys.includes("page-activity") && !text.includes("<ActivityButton")) wrong.push(`${tour.key}: page-activity`)
    }
    expect(wrong).toEqual([])
  })
})
