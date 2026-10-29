import { useMemo, useState } from "react";

import { Check, ChevronRight, Layers, Search } from "lucide-react";

import { cn } from "@effy/design-system";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Input,
} from "@effy/design-system/ui";
import {
  searchLeaves,
  suggestCategories,
  type SuggestLeaf,
} from "@effy/shared-types";

import { CategoryGlyph } from "../category-icon";

import { type ShopCategory } from "./model";

interface Props {
  categories: readonly ShopCategory[];
  recentLeafIds: readonly string[];
  /** The product's name so far: suggestions come from it. */
  productName: string;
  value: string | null;
  onChange: (leafId: string) => void;
  disabled?: boolean;
  /** Next was tried without a category. */
  invalid?: boolean;
  /** How the leaf was found, for the console's analytics. */
  onEvent?: (event: CategoryPickerEvent) => void;
}

export type CategoryPickerEvent =
  | { name: "category_suggestion_chosen"; rank: number }
  | { name: "category_searched" }
  | { name: "category_browsed"; depth: number };

/**
 * The home category. Once chosen it shows its full path with a way to change it; until then, suggestions from
 * the product's name, the leaves used recently, a search, and Browse (column by column). Only a category with
 * no sub-categories (a leaf) can be chosen.
 */
export function CategoryPicker({
  categories,
  recentLeafIds,
  productName,
  value,
  onChange,
  disabled,
  invalid,
  onEvent,
}: Props) {
  const track = (e: CategoryPickerEvent) => onEvent?.(e);
  const leaves = useMemo<SuggestLeaf[]>(
    () =>
      categories
        .filter((c) => c.isLeaf)
        .map((c) => ({
          id: c.id,
          name: c.name,
          path: c.path,
          synonyms: c.synonyms,
        })),
    [categories],
  );
  const byId = useMemo(
    () => new Map(categories.map((c) => [c.id, c])),
    [categories],
  );
  const suggestions = useMemo(
    () => suggestCategories(productName, leaves),
    [productName, leaves],
  );
  const recent = recentLeafIds
    .map((id) => byId.get(id))
    .filter((c): c is ShopCategory => !!c && c.isLeaf);
  const [changing, setChanging] = useState(false);
  const [browsing, setBrowsing] = useState(false);
  const [q, setQ] = useState("");
  const found = useMemo(() => searchLeaves(q, leaves, 40), [q, leaves]);
  const chosen = value ? byId.get(value) : undefined;

  const choose = (id: string) => {
    if (disabled) return;
    onChange(id);
    setChanging(false);
    setBrowsing(false);
    setQ("");
  };

  if (chosen && !changing) {
    return (
      <div className="flex items-center gap-4 rounded-lg border px-4 py-3" aria-live="polite">
        <span className="grid size-10 shrink-0 place-items-center rounded-md bg-primary-muted text-primary">
          <CategoryGlyph icon={chosen.icon ?? rootOf(chosen, byId)?.icon} className="size-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-semibold">{chosen.name}</span>
          <span className="block truncate text-sm text-muted-foreground">
            {chosen.path.join(" › ")}
          </span>
        </span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled}
          onClick={() => setChanging(true)}
        >
          Change
        </Button>
      </div>
    );
  }

  const name = productName.trim();
  return (
    <div className="grid gap-4">
      {name ? (
        <LeafList
          title={`Suggested for “${name}”`}
          empty="No suggestion for this name. Search or browse instead."
          items={suggestions.map((l) => ({ id: l.id, path: l.path }))}
          value={value}
          disabled={disabled}
          onPick={(id, rank) => {
            track({ name: "category_suggestion_chosen", rank });
            choose(id);
          }}
        />
      ) : (
        <p className="text-sm text-muted-foreground">
          Type the product&apos;s name above and suggestions appear here.
        </p>
      )}
      {recent.length > 0 ? (
        <LeafList
          title="Recently used"
          items={recent.map((c) => ({ id: c.id, path: c.path }))}
          value={value}
          disabled={disabled}
          onPick={(id) => choose(id)}
        />
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-60 flex-1">
          <Search
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            aria-label="Search categories"
            placeholder="Search categories, e.g. yoghurt, charger, dog food"
            className="pl-9"
            value={q}
            disabled={disabled}
            aria-invalid={invalid || undefined}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          onClick={() => setBrowsing(true)}
        >
          <Layers aria-hidden="true" />
          Browse
        </Button>
        {chosen ? (
          <Button type="button" variant="ghost" onClick={() => setChanging(false)}>
            Cancel
          </Button>
        ) : null}
      </div>
      {q.trim() ? (
        <LeafList
          title="Results"
          items={found.map((l) => ({ id: l.id, path: l.path }))}
          empty="No category matches. Try another word, or browse."
          value={value}
          disabled={disabled}
          onPick={(id) => {
            track({ name: "category_searched" });
            choose(id);
          }}
        />
      ) : null}

      <Dialog open={browsing} onOpenChange={setBrowsing}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Browse categories</DialogTitle>
            <DialogDescription>
              Open a department, then the aisle. Only the last level holds products.
            </DialogDescription>
          </DialogHeader>
          <Columns
            categories={categories}
            value={value}
            disabled={disabled}
            onPick={choose}
            onBrowse={(depth) => track({ name: "category_browsed", depth })}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}

function rootOf(
  c: ShopCategory,
  byId: Map<string, ShopCategory>,
): ShopCategory | undefined {
  let at: ShopCategory | undefined = c;
  while (at?.parentId) at = byId.get(at.parentId);
  return at;
}

function LeafList({
  title,
  items,
  empty,
  value,
  disabled,
  onPick,
}: {
  title?: string;
  items: { id: string; path: string[] }[];
  empty?: string;
  value: string | null;
  disabled?: boolean;
  onPick: (id: string, rank: number) => void;
}) {
  return (
    <div className="grid gap-1.5">
      {title ? (
        <p className="text-sm font-medium text-muted-foreground">
          {title}
        </p>
      ) : null}
      {items.length === 0 ? (
        empty ? (
          <p className="text-sm text-muted-foreground">{empty}</p>
        ) : null
      ) : (
        <ul
          className="divide-border border-border divide-y rounded-md border"
          role="listbox"
          aria-label={title ?? "Categories"}
        >
          {items.map((it, i) => {
            const selected = it.id === value;
            return (
              <li key={it.id} role="option" aria-selected={selected}>
                <Button
                  type="button"
                  variant="ghost"
                  disabled={disabled}
                  className={cn(
                    "h-auto min-h-10 w-full justify-start rounded-none px-3 py-2 text-left font-normal whitespace-normal",
                    selected && "bg-muted",
                  )}
                  onClick={() => onPick(it.id, i + 1)}
                >
                  <span className="min-w-0 flex-1">
                    <span className="text-muted-foreground">
                      {it.path.slice(0, -1).join(" › ")}
                      {it.path.length > 1 ? " › " : ""}
                    </span>
                    <span className="font-medium">
                      {it.path[it.path.length - 1]}
                    </span>
                  </span>
                  {selected ? (
                    <Check aria-hidden className="size-4 text-primary" />
                  ) : null}
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** Department → … → leaf, one column per level; a category with sub-categories opens the next column. */
function Columns({
  categories,
  value,
  disabled,
  onPick,
  onBrowse,
}: {
  categories: readonly ShopCategory[];
  value: string | null;
  disabled?: boolean;
  onPick: (id: string) => void;
  onBrowse: (depth: number) => void;
}) {
  const byParent = useMemo(() => {
    const m = new Map<string | null, ShopCategory[]>();
    for (const c of categories)
      m.set(c.parentId, [...(m.get(c.parentId) ?? []), c]);
    return m;
  }, [categories]);
  const byId = useMemo(
    () => new Map(categories.map((c) => [c.id, c])),
    [categories],
  );
  // The open trail starts at the chosen leaf's ancestors.
  const [trail, setTrail] = useState<string[]>(() => {
    const out: string[] = [];
    for (
      let c = value ? byId.get(value) : undefined;
      c?.parentId;
      c = byId.get(c.parentId)
    )
      out.unshift(c.parentId);
    return out;
  });
  const columns = [null, ...trail].map(
    (parentId) => byParent.get(parentId) ?? [],
  );

  return (
    <div
      className="flex snap-x gap-2 overflow-x-auto pb-1"
      role="group"
      aria-label="Browse categories"
    >
      {columns.map((col, depth) => (
        <ul
          key={depth}
          className="border-border min-w-56 max-w-64 shrink-0 snap-start overflow-y-auto rounded-md border"
          style={{ maxHeight: 360 }}
        >
          {col.map((c) => {
            const open = trail[depth] === c.id;
            const selected = c.id === value;
            return (
              <li key={c.id}>
                <Button
                  type="button"
                  variant="ghost"
                  disabled={disabled}
                  aria-expanded={c.isLeaf ? undefined : open}
                  aria-pressed={c.isLeaf ? selected : undefined}
                  className={cn(
                    "h-auto min-h-10 w-full justify-start rounded-none px-3 py-2 text-left font-normal whitespace-normal",
                    (open || selected) && "bg-muted font-medium",
                  )}
                  onClick={() => {
                    if (c.isLeaf) onPick(c.id);
                    else {
                      setTrail([...trail.slice(0, depth), c.id]);
                      onBrowse(depth + 1);
                    }
                  }}
                >
                  {depth === 0 ? (
                    <CategoryGlyph
                      icon={c.icon}
                      className="size-4 shrink-0 text-muted-foreground"
                    />
                  ) : null}
                  <span className="min-w-0 flex-1 truncate">{c.name}</span>
                  {c.isLeaf ? (
                    selected ? (
                      <Check aria-hidden className="size-4 text-primary" />
                    ) : null
                  ) : (
                    <ChevronRight
                      aria-hidden
                      className="size-4 text-muted-foreground"
                    />
                  )}
                </Button>
              </li>
            );
          })}
        </ul>
      ))}
    </div>
  );
}
