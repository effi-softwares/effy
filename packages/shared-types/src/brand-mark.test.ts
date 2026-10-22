import { readFileSync } from "node:fs"
import { resolve } from "node:path"

import { describe, expect, it } from "vitest"

import { WORDMARK_PATHS, WORDMARK_VIEWBOX } from "./brand-mark"

describe("the wordmark's paths (labels and documents)", () => {
  it("are the brand file's own", () => {
    const svg = readFileSync(resolve(__dirname, "../../brand/src/wordmark.svg"), "utf8")
    expect(svg).toContain(`viewBox="0 0 ${WORDMARK_VIEWBOX.w} ${WORDMARK_VIEWBOX.h}"`)
    for (const d of WORDMARK_PATHS) expect(svg).toContain(`d="${d}"`)
    expect((svg.match(/<path /g) ?? []).length).toBe(WORDMARK_PATHS.length)
  })
})
