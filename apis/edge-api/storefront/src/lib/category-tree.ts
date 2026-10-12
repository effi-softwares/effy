// "This category" always means the category AND everything filed under it.
//
// ⚠ A product is filed in ONE category — usually a leaf ("Full cream"). An aisle ("Dairy & eggs") or a
// group ("Milk") holds almost nothing directly, so a filter that matched `primary_category_id` exactly
// showed an empty page for every aisle link in the header. These fragments are the one definition of
// a category's contents: the search filter, the home rails and the category counts all read through
// them, so "Milk (24)" and the page behind it can never disagree.

/** The ids of the category with this key and all its descendants. `key` is a bind placeholder (`$3`). */
export function categorySubtreeByKey(key: string): string {
  return subtree(`key = ${key}`);
}

/** The same set, starting from an id expression (`c.id`). */
export function categorySubtreeById(id: string): string {
  return subtree(`id = ${id}`);
}

function subtree(root: string): string {
  return (
    "(WITH RECURSIVE sub AS (" +
    `SELECT id FROM public.category WHERE ${root} ` +
    "UNION ALL SELECT child.id FROM public.category child JOIN sub ON child.parent_id = sub.id" +
    ") SELECT id FROM sub)"
  );
}
