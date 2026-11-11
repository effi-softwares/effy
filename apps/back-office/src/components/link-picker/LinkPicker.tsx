import { useMemo, useState } from "react"

import { useQuery } from "@tanstack/react-query"
import { X } from "lucide-react"

import { BANNER_LINK_KINDS, BANNER_LINK_WORDS, type BannerLinkKind } from "@effy/shared-types"
import { Button, Input, ToggleGroup, ToggleGroupItem } from "@effy/design-system/ui"
import { Bone, boneWidth, Loading } from "@effy/web-kit/patterns"

import { index, pathOf, pathText } from "@/features/taxonomy/model"
import { treeQuery } from "@/features/taxonomy/queries"

import { searchPromotionProducts } from "@/features/promotions/repo"

/** A place in the storefront a tap can lead: search, the sale page, an aisle (with its key) or a product. */
export interface LinkChoice {
  kind: BannerLinkKind
  category: { id: string; name: string; key?: string } | null
  product: { id: string; name: string } | null
}

/**
 * Where a tap leads in the storefront: an information banner's link (108) and a customer message's destination
 * (112). Search, the sale page, an aisle or a product.
 */
export function LinkPicker({
  value,
  onChange,
  invalid,
}: {
  value: LinkChoice
  onChange: (link: LinkChoice) => void
  invalid?: boolean
}) {
  const [q, setQ] = useState("")
  const [categoryQ, setCategoryQ] = useState("")
  const found = useQuery({
    queryKey: ["back-office", "promotions", "product-search", q],
    queryFn: () => searchPromotionProducts(q),
    enabled: value.kind === "product" && q.trim().length >= 2,
  })
  const tree = useQuery({ ...treeQuery(), enabled: value.kind === "category" })
  // Any active aisle, found by its full path: a tap opens it with everything beneath it.
  const categories = useMemo(() => {
    const all = tree.data ?? []
    const byId = index(all)
    return all
      .filter((c) => c.status === "active")
      .map((c) => ({ id: c.id, key: c.key, path: pathText(pathOf(c.id, byId)) }))
      .sort((a, b) => a.path.localeCompare(b.path))
  }, [tree.data])
  const words = categoryQ.trim().toLowerCase().split(/\s+/).filter(Boolean)
  const shown =
    words.length > 0 ? categories.filter((c) => words.every((w) => c.path.toLowerCase().includes(w))).slice(0, 12) : []

  return (
    <div className="space-y-4">
      <ToggleGroup
        type="single"
        variant="outline"
        aria-label="Where a tap leads"
        value={value.kind}
        onValueChange={(v) => v && onChange({ ...value, kind: v as BannerLinkKind })}
        className="flex-wrap"
      >
        {BANNER_LINK_KINDS.map((k) => (
          <ToggleGroupItem key={k} value={k} className="px-3">
            {BANNER_LINK_WORDS[k]}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>

      {value.kind === "search" ? (
        <p className="text-sm text-muted-foreground">A tap opens search, ready for the shopper to type.</p>
      ) : null}
      {value.kind === "sale" ? (
        <p className="text-sm text-muted-foreground">A tap opens every product on sale.</p>
      ) : null}

      {value.kind === "category" ? (
        value.category ? (
          <Chosen
            name={categories.find((c) => c.id === value.category!.id)?.path ?? value.category.name}
            onClear={() => onChange({ ...value, category: null })}
          />
        ) : (
          <div className="space-y-2">
            <Input
              aria-label="Find an aisle"
              aria-invalid={invalid || undefined}
              placeholder="Find an aisle, e.g. kitchen appliances"
              value={categoryQ}
              onChange={(e) => setCategoryQ(e.target.value)}
            />
            {tree.isPending ? <RowBones label="Loading aisles" /> : null}
            <ul className="divide-y rounded-lg border empty:hidden">
              {shown.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    className="w-full px-3 py-2 text-left text-sm hover:bg-row-hover"
                    onClick={() => onChange({ ...value, category: { id: c.id, name: c.path, key: c.key } })}
                  >
                    {c.path}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )
      ) : null}

      {value.kind === "product" ? (
        value.product ? (
          <Chosen name={value.product.name} onClear={() => onChange({ ...value, product: null })} />
        ) : (
          <div className="space-y-2">
            <Input
              aria-label="Find a product"
              aria-invalid={invalid || undefined}
              placeholder="Find a product by name, brand or stock code"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            {found.isFetching ? <RowBones label="Searching products" /> : null}
            <ul className="divide-y rounded-lg border empty:hidden">
              {(found.data ?? []).map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    className="w-full px-3 py-2 text-left text-sm hover:bg-row-hover"
                    onClick={() => onChange({ ...value, product: { id: p.id, name: p.name } })}
                  >
                    {p.name}
                    {p.brand ? <span className="ml-2 text-muted-foreground">{p.brand}</span> : null}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )
      ) : null}
    </div>
  )
}

function Chosen({ name, onClear }: { name: string; onClear: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm">
      <span className="truncate">{name}</span>
      <Button type="button" variant="ghost" size="icon" aria-label={`Remove ${name}`} onClick={onClear}>
        <X aria-hidden="true" />
      </Button>
    </div>
  )
}

function RowBones({ label }: { label: string }) {
  return (
    <Loading label={label}>
      <div className="space-y-2 rounded-lg border px-3 py-2">
        {[0, 1, 2].map((i) => (
          <Bone key={i} className={`max-w-64 ${boneWidth(i)}`} />
        ))}
      </div>
    </Loading>
  )
}
