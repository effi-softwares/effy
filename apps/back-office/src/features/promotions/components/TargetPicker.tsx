import { useMemo, useState } from "react"

import { useQuery } from "@tanstack/react-query"
import { X } from "lucide-react"

import { Button, Checkbox, Input, ToggleGroup, ToggleGroupItem } from "@effy/design-system/ui"

import { index, pathOf, pathText } from "@/features/taxonomy/model"
import { treeQuery } from "@/features/taxonomy/queries"

import { searchPromotionProducts } from "../repo"

export type AppliesTo = "products" | "categories" | "brands"

export interface Targets {
  products: { id: string; name: string }[]
  categoryIds: string[]
  brands: string[]
}

export function TargetPicker({
  appliesTo,
  onAppliesTo,
  value,
  onChange,
  disabled,
}: {
  appliesTo: AppliesTo
  onAppliesTo: (a: AppliesTo) => void
  value: Targets
  onChange: (t: Targets) => void
  disabled: boolean
}) {
  const [q, setQ] = useState("")
  const [brand, setBrand] = useState("")
  const found = useQuery({
    queryKey: ["back-office", "promotions", "product-search", q],
    queryFn: () => searchPromotionProducts(q),
    enabled: q.trim().length >= 2,
  })
  const [categoryQ, setCategoryQ] = useState("")
  const tree = useQuery({ ...treeQuery(), enabled: appliesTo === "categories" })
  // A category target covers everything beneath it, so any active level can be chosen; found by its full path.
  const categories = useMemo(() => {
    const all = tree.data ?? []
    const byId = index(all)
    return all
      .filter((c) => c.status === "active")
      .map((c) => ({ id: c.id, path: pathText(pathOf(c.id, byId)) }))
      .sort((a, b) => a.path.localeCompare(b.path))
  }, [tree.data])
  const words = categoryQ.trim().toLowerCase().split(/\s+/).filter(Boolean)
  const shownCategories = categories.filter(
    (c) =>
      value.categoryIds.includes(c.id) || (words.length > 0 && words.every((w) => c.path.toLowerCase().includes(w))),
  )

  return (
    <div className="space-y-4">
      <ToggleGroup
        type="single"
        variant="outline"
        aria-label="Applies to"
        disabled={disabled}
        value={appliesTo}
        onValueChange={(v) => v && onAppliesTo(v as typeof appliesTo)}
      >
        {(["products", "categories", "brands"] as const).map((a) => (
          <ToggleGroupItem key={a} value={a} className="px-3">
            {a === "products" ? "Chosen products" : a === "categories" ? "Categories" : "Brands"}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>

      {appliesTo === "products" ? (
        <div className="space-y-3">
          <Input
            aria-label="Find products"
            placeholder="Search by name, SKU or brand…"
            value={q}
            disabled={disabled}
            onChange={(e) => setQ(e.target.value)}
            className="max-w-md"
          />
          {found.data && found.data.length > 0 ? (
            <ul className="max-h-48 divide-y divide-border overflow-y-auto rounded-md border border-border">
              {found.data.map((p) => {
                const on = value.products.some((x) => x.id === p.id)
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
                )
              })}
            </ul>
          ) : null}
          <Chips
            items={value.products.map((p) => ({ key: p.id, label: p.name }))}
            disabled={disabled}
            onRemove={(k) => onChange({ ...value, products: value.products.filter((p) => p.id !== k) })}
            empty="No products chosen yet."
          />
        </div>
      ) : appliesTo === "categories" ? (
        <div className="space-y-3">
          <Input
            aria-label="Find categories"
            placeholder="Search categories, e.g. dairy yoghurt…"
            value={categoryQ}
            disabled={disabled}
            onChange={(e) => setCategoryQ(e.target.value)}
            className="max-w-md"
          />
          <ul className="max-h-64 space-y-2 overflow-y-auto">
            {shownCategories.slice(0, 60).map((c) => (
              <li key={c.id}>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    disabled={disabled}
                    checked={value.categoryIds.includes(c.id)}
                    onCheckedChange={(v) =>
                      onChange({
                        ...value,
                        categoryIds:
                          v === true ? [...value.categoryIds, c.id] : value.categoryIds.filter((x) => x !== c.id),
                      })
                    }
                  />
                  {c.path}
                </label>
              </li>
            ))}
            {shownCategories.length === 0 ? (
              <li className="text-sm text-muted-foreground">
                {words.length > 0 ? "No category matches." : "Type to find categories."}
              </li>
            ) : null}
          </ul>
        </div>
      ) : (
        <div className="space-y-3">
          <form
            className="flex max-w-md gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              const b = brand.trim()
              if (b && !value.brands.some((x) => x.toLowerCase() === b.toLowerCase()))
                onChange({ ...value, brands: [...value.brands, b] })
              setBrand("")
            }}
          >
            <Input
              aria-label="Brand"
              placeholder="Brand name, as on the product"
              value={brand}
              disabled={disabled}
              onChange={(e) => setBrand(e.target.value)}
            />
            <Button type="submit" variant="outline" disabled={disabled || !brand.trim()}>
              Add
            </Button>
          </form>
          <Chips
            items={value.brands.map((b) => ({ key: b, label: b }))}
            disabled={disabled}
            onRemove={(k) => onChange({ ...value, brands: value.brands.filter((b) => b !== k) })}
            empty="No brands chosen yet."
          />
        </div>
      )}
    </div>
  )
}

function Chips({
  items,
  onRemove,
  disabled,
  empty,
}: {
  items: { key: string; label: string }[]
  onRemove: (k: string) => void
  disabled: boolean
  empty: string
}) {
  if (items.length === 0) return <p className="mt-0.5 block text-sm text-muted-foreground">{empty}</p>
  return (
    <ul className="flex flex-wrap gap-2">
      {items.map((i) => (
        <li key={i.key} className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-1 text-sm">
          {i.label}
          {disabled ? null : (
            <Button
              type="button"
              variant="ghost"
              size="xs"
              aria-label={`Remove ${i.label}`}
              className="touch-hit size-7 p-0 text-muted-foreground pointer-coarse:min-h-0"
              onClick={() => onRemove(i.key)}
            >
              <X aria-hidden="true" />
            </Button>
          )}
        </li>
      ))}
    </ul>
  )
}
