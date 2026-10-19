import { useState } from "react";

import { useQuery } from "@tanstack/react-query";
import { X } from "lucide-react";

import { Button, Checkbox, Input } from "@effy/design-system/ui";

import { categoriesQuery } from "@/features/catalog-schema/queries";

import { searchPromotionProducts } from "../repo";

export type AppliesTo = "products" | "categories" | "brands";

export interface Targets {
  products: { id: string; name: string }[];
  categoryIds: string[];
  brands: string[];
}

/**
 * What an item or buy-X-get-Y promotion covers (094 US3): chosen products (searched by name, SKU or
 * brand), whole categories (their sub-categories too), or brands. One kind of target at a time.
 */
export function TargetPicker({
  appliesTo,
  onAppliesTo,
  value,
  onChange,
  disabled,
}: {
  appliesTo: AppliesTo;
  onAppliesTo: (a: AppliesTo) => void;
  value: Targets;
  onChange: (t: Targets) => void;
  disabled: boolean;
}) {
  const [q, setQ] = useState("");
  const [brand, setBrand] = useState("");
  const found = useQuery({ queryKey: ["back-office", "promotions", "product-search", q], queryFn: () => searchPromotionProducts(q), enabled: q.trim().length >= 2 });
  const categories = useQuery({ ...categoriesQuery(), enabled: appliesTo === "categories" });

  return (
    <div className="space-y-4">
      <div role="group" aria-label="Applies to" className="bo-seg">
        {(["products", "categories", "brands"] as const).map((a) => (
          <button key={a} type="button" disabled={disabled} className={appliesTo === a ? "is-active" : undefined} aria-pressed={appliesTo === a} onClick={() => onAppliesTo(a)}>
            {a === "products" ? "Chosen products" : a === "categories" ? "Categories" : "Brands"}
          </button>
        ))}
      </div>

      {appliesTo === "products" ? (
        <div className="space-y-3">
          <Input aria-label="Find products" placeholder="Search by name, SKU or brand…" value={q} disabled={disabled} onChange={(e) => setQ(e.target.value)} className="max-w-md" />
          {found.data && found.data.length > 0 ? (
            <ul className="max-h-48 divide-y divide-border overflow-y-auto rounded-md border border-border">
              {found.data.map((p) => {
                const on = value.products.some((x) => x.id === p.id);
                return (
                  <li key={p.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                    <span>
                      {p.name}
                      {p.brand ? <span className="text-muted-foreground"> · {p.brand}</span> : null}
                    </span>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={disabled || on}
                      onClick={() => onChange({ ...value, products: [...value.products, { id: p.id, name: p.name }] })}
                    >
                      {on ? "Added" : "Add"}
                    </Button>
                  </li>
                );
              })}
            </ul>
          ) : null}
          <Chips items={value.products.map((p) => ({ key: p.id, label: p.name }))} disabled={disabled} onRemove={(k) => onChange({ ...value, products: value.products.filter((p) => p.id !== k) })} empty="No products chosen yet." />
        </div>
      ) : appliesTo === "categories" ? (
        <ul className="grid max-h-64 gap-2 overflow-y-auto sm:grid-cols-2">
          {(categories.data ?? [])
            .filter((c) => c.status === "active")
            .map((c) => (
              <li key={c.id}>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    disabled={disabled}
                    checked={value.categoryIds.includes(c.id)}
                    onCheckedChange={(v) => onChange({ ...value, categoryIds: v === true ? [...value.categoryIds, c.id] : value.categoryIds.filter((x) => x !== c.id) })}
                  />
                  {c.name}
                </label>
              </li>
            ))}
        </ul>
      ) : (
        <div className="space-y-3">
          <form
            className="flex max-w-md gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const b = brand.trim();
              if (b && !value.brands.some((x) => x.toLowerCase() === b.toLowerCase())) onChange({ ...value, brands: [...value.brands, b] });
              setBrand("");
            }}
          >
            <Input aria-label="Brand" placeholder="Brand name, as on the product" value={brand} disabled={disabled} onChange={(e) => setBrand(e.target.value)} />
            <Button type="submit" variant="outline" disabled={disabled || !brand.trim()}>
              Add
            </Button>
          </form>
          <Chips items={value.brands.map((b) => ({ key: b, label: b }))} disabled={disabled} onRemove={(k) => onChange({ ...value, brands: value.brands.filter((b) => b !== k) })} empty="No brands chosen yet." />
        </div>
      )}
    </div>
  );
}

function Chips({ items, onRemove, disabled, empty }: { items: { key: string; label: string }[]; onRemove: (k: string) => void; disabled: boolean; empty: string }) {
  if (items.length === 0) return <p className="bo-sub">{empty}</p>;
  return (
    <ul className="flex flex-wrap gap-2">
      {items.map((i) => (
        <li key={i.key} className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-sm">
          {i.label}
          {disabled ? null : (
            <button type="button" aria-label={`Remove ${i.label}`} className="text-muted-foreground hover:text-foreground" onClick={() => onRemove(i.key)}>
              <X className="size-3.5" aria-hidden="true" />
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}
