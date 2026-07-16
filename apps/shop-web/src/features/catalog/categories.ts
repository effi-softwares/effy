import type { Category } from "./model";

/**
 * Flatten the parentId-linked category list into a stable, indented pre-order — the shape both the
 * create flow's category Select and the focused-edit dialog render. Shared so the ordering rule lives
 * in one place.
 */
export function orderCategories(categories: Category[]): { category: Category; depth: number }[] {
  const byParent = new Map<string | null, Category[]>();
  for (const c of categories) {
    const list = byParent.get(c.parentId) ?? [];
    list.push(c);
    byParent.set(c.parentId, list);
  }
  for (const list of byParent.values()) list.sort((a, b) => a.displayOrder - b.displayOrder);

  const out: { category: Category; depth: number }[] = [];
  const walk = (parentId: string | null, depth: number) => {
    for (const c of byParent.get(parentId) ?? []) {
      out.push({ category: c, depth });
      walk(c.id, depth + 1);
    }
  };
  walk(null, 0);
  return out;
}
