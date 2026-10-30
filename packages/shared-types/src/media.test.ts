import { readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

import { describe, expect, it } from "vitest"

import { renditionUrl, srcSet } from "./media"

const here = dirname(fileURLToPath(import.meta.url))
interface Case { name: string; imageUrl: string; width: number; expect?: string; throws?: boolean }
const { cases } = JSON.parse(readFileSync(resolve(here, "media.fixtures.json"), "utf8")) as { cases: Case[] }

describe("renditionUrl - the one naming rule (086 contracts/wire.md)", () => {
  it.each(cases.map((c) => [c.name, c] as const))("%s", (_, c) => {
    if (c.throws) expect(() => renditionUrl(c.imageUrl, c.width)).toThrow(RangeError)
    else expect(renditionUrl(c.imageUrl, c.width)).toBe(c.expect)
  })
})

describe("srcSet", () => {
  it("lists each copy with its width", () => {
    expect(srcSet("https://m.example/products/o/t.jpg", [160, 320])).toBe(
      "https://m.example/renditions/products/o/t/w160.webp 160w, https://m.example/renditions/products/o/t/w320.webp 320w",
    )
  })
  it("is empty for no copies", () => {
    expect(srcSet("https://m.example/products/o/t.jpg", [])).toBe("")
  })
})
