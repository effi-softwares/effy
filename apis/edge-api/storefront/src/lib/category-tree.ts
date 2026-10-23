// A category means the category and everything under it. Products are filed in leaves, so these
// fragments are the one definition of a category's contents for search, rails and counts.

/** `key` is a bind placeholder (`$3`). */
export function categorySubtreeByKey(key: string): string {
  return subtree(`key = ${key}`);
}

export function categorySubtreeById(id: string): string {
  return subtree(`id = ${id}`);
}

/** Every (root_id, id) pair as a recursive CTE body: one taxonomy walk for many categories. */
export function categoryClosure(): string {
  return (
    "SELECT id AS root_id, id FROM public.category " +
    "UNION ALL SELECT tree.root_id, child.id FROM public.category child JOIN tree ON child.parent_id = tree.id"
  );
}

function subtree(root: string): string {
  return (
    "(WITH RECURSIVE sub AS (" +
    `SELECT id FROM public.category WHERE ${root} ` +
    "UNION ALL SELECT child.id FROM public.category child JOIN sub ON child.parent_id = sub.id" +
    ") SELECT id FROM sub)"
  );
}
