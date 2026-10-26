import { describe, expect, it } from "vitest"

import { CATEGORY_ICON_FALLBACK, CATEGORY_ICONS } from "@effy/shared-types"

import { CATEGORY_ICON_COMPONENTS, categoryIconComponent } from "./index"

describe("category glyphs (101)", () => {
  it("every key renders a Lucide icon", () => {
    for (const key of CATEGORY_ICONS) expect(CATEGORY_ICON_COMPONENTS[key], key).toBeDefined()
    expect(Object.keys(CATEGORY_ICON_COMPONENTS)).toHaveLength(CATEGORY_ICONS.length)
  })

  it("no icon is the fallback", () => {
    expect(categoryIconComponent(null)).toBe(CATEGORY_ICON_COMPONENTS[CATEGORY_ICON_FALLBACK])
  })
})
