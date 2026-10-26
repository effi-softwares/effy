import { describe, expect, it } from "vitest"

import type { TaxonomyCategoryDTO } from "@effy/shared-types"

import { buildTree, canAddChild, descendants, dropRefusal, heightOf, index, leavesWithPaths, pathOf } from "./model"

function cat(id: string, parentId: string | null, over: Partial<TaxonomyCategoryDTO> = {}): TaxonomyCategoryDTO {
  return {
    id,
    parentId,
    key: id,
    name: id.toUpperCase(),
    position: 0,
    status: "active",
    icon: null,
    imageKey: null,
    imageUrl: null,
    synonyms: [],
    defaults: { storage: null, gstStatus: null, ageRestricted: null },
    resolved: null,
    productCount: 0,
    placementCount: 0,
    ...over,
  }
}

// a › b › c › d › e (five levels); a › f (a leaf with products); g (department); r (retired, under g)
const tree = [
  cat("a", null, { position: 10 }),
  cat("b", "a"),
  cat("c", "b"),
  cat("d", "c"),
  cat("e", "d"),
  cat("f", "a", { position: 20, productCount: 3 }),
  cat("g", null, { position: 5 }),
  cat("r", "g", { status: "retired" }),
]

describe("taxonomy tree helpers (101)", () => {
  it("builds the forest in saved order with depths", () => {
    const roots = buildTree(tree)
    expect(roots.map((n) => n.category.id)).toEqual(["g", "a"])
    expect(roots[1]!.children.map((n) => [n.category.id, n.depth])).toEqual([
      ["b", 2],
      ["f", 2],
    ])
  })

  it("paths, heights and descendants", () => {
    const byId = index(tree)
    expect(pathOf("e", byId)).toEqual(["A", "B", "C", "D", "E"])
    expect(heightOf("b", tree)).toBe(3)
    expect([...descendants("b", tree)].sort()).toEqual(["c", "d", "e"])
  })

  it("refuses the drops the server would refuse", () => {
    expect(dropRefusal("b", "b", tree)).toBe("self")
    expect(dropRefusal("b", "d", tree)).toBe("cycle")
    expect(dropRefusal("b", "g", tree)).toBeNull() // g(1) + b's 4 levels = 5
    expect(dropRefusal("c", "e", tree)).toBe("cycle")
    expect(dropRefusal("g", "e", tree)).toBe("too_deep")
    expect(dropRefusal("g", "f", tree)).toBe("has_products")
    expect(dropRefusal("e", "r", tree)).toBe("parent_retired")
    expect(dropRefusal("r", null, tree)).toBe("retired")
    expect(dropRefusal("e", null, tree)).toBeNull()
  })

  it("adds a level only above five, and lists active leaves under active parents", () => {
    const byId = index(tree)
    expect(canAddChild("d", byId)).toBe(true)
    expect(canAddChild("e", byId)).toBe(false)
    expect(canAddChild("r", byId)).toBe(false)
    expect(leavesWithPaths(tree).map((l) => l.id)).toEqual(["e", "f", "g"])
  })
})
