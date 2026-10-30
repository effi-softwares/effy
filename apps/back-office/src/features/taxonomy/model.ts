import { CATEGORY_DEPTH_MAX, type TaxonomyCategoryDTO } from "@effy/shared-types"

export type Category = TaxonomyCategoryDTO

export interface TreeNode {
  category: Category
  depth: number
  children: TreeNode[]
}

const byPlace = (a: Category, b: Category) => a.position - b.position || a.name.localeCompare(b.name)

/** The forest, departments first, each level in its saved order. Retired categories stay in place. */
export function buildTree(categories: readonly Category[]): TreeNode[] {
  const kids = new Map<string | null, Category[]>()
  for (const c of categories) kids.set(c.parentId, [...(kids.get(c.parentId) ?? []), c])
  const grow = (parentId: string | null, depth: number): TreeNode[] =>
    (kids.get(parentId) ?? [])
      .sort(byPlace)
      .map((category) => ({ category, depth, children: grow(category.id, depth + 1) }))
  return grow(null, 1)
}

export function index(categories: readonly Category[]): Map<string, Category> {
  return new Map(categories.map((c) => [c.id, c]))
}

/** Names from the department down to `id`. */
export function pathOf(id: string, byId: Map<string, Category>): string[] {
  const out: string[] = []
  for (let c = byId.get(id); c; c = c.parentId ? byId.get(c.parentId) : undefined) out.unshift(c.name)
  return out
}

export function depthOf(id: string, byId: Map<string, Category>): number {
  return pathOf(id, byId).length
}

/** Every category beneath `id` (not itself). */
export function descendants(id: string, categories: readonly Category[]): Set<string> {
  const out = new Set<string>()
  let frontier = [id]
  while (frontier.length > 0) {
    const next = categories
      .filter((c) => c.parentId !== null && frontier.includes(c.parentId) && !out.has(c.id))
      .map((c) => c.id)
    for (const n of next) out.add(n)
    frontier = next
  }
  return out
}

/** Levels below `id` (0 for a leaf). */
export function heightOf(id: string, categories: readonly Category[]): number {
  const kids = categories.filter((c) => c.parentId === id)
  return kids.length === 0 ? 0 : 1 + Math.max(...kids.map((k) => heightOf(k.id, categories)))
}

export function hasActiveChildren(id: string, categories: readonly Category[]): boolean {
  return categories.some((c) => c.parentId === id && c.status === "active")
}

export function isLeaf(id: string, categories: readonly Category[]): boolean {
  return !hasActiveChildren(id, categories)
}

export type DropRefusal = "self" | "cycle" | "too_deep" | "parent_retired" | "has_products" | "retired"

/**
 * Whether `dragId` may move under `parentId` (null = a department). The server decides; this only
 * stops the tree offering a drop it would refuse.
 */
export function dropRefusal(
  dragId: string,
  parentId: string | null,
  categories: readonly Category[],
): DropRefusal | null {
  const byId = index(categories)
  const drag = byId.get(dragId)
  if (!drag || drag.status !== "active") return "retired"
  if (parentId === null) return heightOf(dragId, categories) + 1 > CATEGORY_DEPTH_MAX ? "too_deep" : null
  if (parentId === dragId) return "self"
  if (descendants(dragId, categories).has(parentId)) return "cycle"
  const parent = byId.get(parentId)
  if (!parent || parent.status !== "active") return "parent_retired"
  if (depthOf(parentId, byId) + 1 + heightOf(dragId, categories) > CATEGORY_DEPTH_MAX) return "too_deep"
  // A leaf that holds products cannot take a sub-category by a move (adding one asks to move them instead).
  if (
    parentId !== drag.parentId &&
    isLeaf(parentId, categories) &&
    (parent.productCount > 0 || parent.placementCount > 0)
  ) {
    return "has_products"
  }
  return null
}

/** The category can take one more level beneath it. */
export function canAddChild(id: string, byId: Map<string, Category>): boolean {
  const c = byId.get(id)
  return Boolean(c && c.status === "active" && depthOf(id, byId) < CATEGORY_DEPTH_MAX)
}

/** Active leaves under active ancestors, with their paths, in path order - for pickers. */
export function leavesWithPaths(categories: readonly Category[]): { id: string; path: string[] }[] {
  const byId = index(categories)
  const live = (c: Category): boolean => c.status === "active" && (c.parentId === null || live(byId.get(c.parentId)!))
  return categories
    .filter((c) => live(c) && isLeaf(c.id, categories))
    .map((c) => ({ id: c.id, path: pathOf(c.id, byId) }))
    .sort((a, b) => pathText(a.path).localeCompare(pathText(b.path)))
}

/** "Dairy, Eggs & Fridge › Yoghurt" - the one way a path is written. */
export const PATH_SEPARATOR = " › "
export const pathText = (path: readonly string[]) => path.join(PATH_SEPARATOR)
