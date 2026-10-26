"use client"

import type { ProductAttributeGroupDTO } from "@effy/shared-types"

import { useSelectedVariant } from "@/lib/selected-variant"

/**
 * The product's details for the size the buy box has selected (101): a detail that differs by size (a
 * flavour's allergens) switches with the selection. Sectioned rows, never cards. Nutrition sits beside
 * the rest on a wide screen.
 */
export function VariantDetails({
  productId,
  detailsByVariant,
  initialVariantId,
}: {
  productId: string
  detailsByVariant: Record<string, ProductAttributeGroupDTO[]>
  initialVariantId: string
}) {
  const selected = useSelectedVariant(productId, initialVariantId)
  const groups = detailsByVariant[selected] ?? detailsByVariant[initialVariantId] ?? []
  const nutrition = groups.filter((g) => /nutrition/i.test(g.groupLabel))
  const specifics = groups.filter((g) => !/nutrition/i.test(g.groupLabel))
  if (groups.length === 0) return null

  return (
    <div className={`grid gap-10 ${nutrition.length > 0 ? "lg:grid-cols-[minmax(0,1fr)_380px]" : ""}`}>
      {specifics.length > 0 ? (
        <section className="min-w-0 max-w-3xl">
          <h2 className="text-xl font-semibold">Item specifics</h2>
          {specifics.map((group) => (
            <SpecTable key={group.groupLabel} group={group} showLabel={specifics.length > 1} />
          ))}
        </section>
      ) : null}
      {nutrition.length > 0 ? (
        <section>
          <h2 className="text-xl font-semibold">Nutrition</h2>
          {nutrition.map((group) => (
            <SpecTable key={group.groupLabel} group={group} showLabel={false} />
          ))}
        </section>
      ) : null}
    </div>
  )
}

function SpecTable({ group, showLabel }: { group: ProductAttributeGroupDTO; showLabel: boolean }) {
  return (
    <div className="mt-4">
      {showLabel && <h3 className="mb-2 text-sm font-medium text-muted-foreground">{group.groupLabel}</h3>}
      <dl className="divide-y overflow-hidden rounded-lg border shadow-xs">
        {group.items.map((item) => (
          <div key={item.label} className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-4 px-4 py-3 text-sm">
            <dt className="text-muted-foreground">{item.label}</dt>
            <dd>{item.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}
