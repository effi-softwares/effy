import { Box, CupSoda, type LucideIcon, Package, SprayCan, UtensilsCrossed } from "lucide-react"

import { cn } from "@/lib/utils"

import type { ProductType } from "../model"

const TYPE_ICONS: { match: RegExp; icon: LucideIcon }[] = [
  { match: /food|meal|prepared|deli|kitchen|bakery|snack/i, icon: UtensilsCrossed },
  { match: /beverage|drink|juice|water|coffee|tea|soda/i, icon: CupSoda },
  { match: /grocery|packaged|pantry|canned|chilled|frozen/i, icon: Package },
  { match: /household|clean|home|paper|non-food/i, icon: SprayCan },
]

function iconForType(t: ProductType): LucideIcon {
  const hay = `${t.key} ${t.name}`
  return TYPE_ICONS.find((m) => m.match.test(hay))?.icon ?? Box
}

interface Props {
  types: ProductType[]
  selectedId: string | null
  onSelect: (id: string) => void
}

export function TypeStep({ types, selectedId, onSelect }: Props) {
  if (types.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No product types are available yet. Ask the back office to define one.
      </p>
    )
  }
  const sorted = [...types].sort((a, b) => a.name.localeCompare(b.name))
  const columns = Math.max(1, Math.ceil(Math.sqrt(sorted.length)))
  return (
    <div className="flex h-full min-h-0 flex-1 flex-col gap-3">
      <p className="shrink-0 text-sm text-muted-foreground">Pick what kind of product this is.</p>
      <div
        className="grid min-h-0 flex-1 auto-rows-fr gap-3 overflow-y-auto p-1"
        style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
      >
        {sorted.map((t) => {
          const Icon = iconForType(t)
          const selected = selectedId === t.id
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => onSelect(t.id)}
              aria-pressed={selected}
              className={cn(
                "flex h-full min-h-32 flex-col items-center justify-center gap-3 rounded-lg border bg-background p-4 text-center transition-colors",
                "hover:bg-[var(--row-hover)]",
                selected ? "border-primary" : "border-border",
              )}
            >
              <span
                className={cn(
                  "flex size-12 shrink-0 items-center justify-center rounded-lg transition-colors",
                  selected ? "bg-primary-fill text-primary-foreground" : "bg-muted text-muted-foreground",
                )}
              >
                <Icon className="size-6" />
              </span>
              <span className="min-w-0">
                <span className="block font-medium leading-tight">{t.name}</span>
                {t.description ? (
                  <span className="mt-1 block text-sm text-muted-foreground">{t.description}</span>
                ) : null}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
