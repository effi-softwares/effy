import type { ProductStatus, ProductStockDTO } from "@effy/shared-types"
import { Archive, ArrowDown, CircleCheck, CircleSlash, PackageX, Pencil, type LucideIcon } from "lucide-react"

import { cn } from "@effy/design-system"

const PRODUCT_STATUS_WORD: Record<ProductStatus, string> = {
  active: "Live",
  draft: "Draft",
  unavailable: "Unavailable",
  archived: "Archived",
}

const LOOK: Record<ProductStatus, { tone: string; icon: LucideIcon }> = {
  active: { tone: "ef-st--done", icon: CircleCheck },
  draft: { tone: "ef-st--waiting", icon: Pencil },
  unavailable: { tone: "ef-st--quiet", icon: CircleSlash },
  archived: { tone: "ef-st--quiet", icon: Archive },
}

function Word({ tone, icon: Icon, children }: { tone: string; icon: LucideIcon; children: string }) {
  return (
    <span className={cn("ef-st", tone)}>
      <Icon aria-hidden="true" />
      {children}
    </span>
  )
}

export function ProductStatusBadge({ status, stock }: { status: ProductStatus; stock?: ProductStockDTO }) {
  if (status === "active" && stock?.tracked) {
    if (stock.outOfStock)
      return (
        <Word tone="ef-st--problem" icon={PackageX}>
          Out of stock
        </Word>
      )
    if (stock.low)
      return (
        <Word tone="ef-st--waiting" icon={ArrowDown}>
          Low stock
        </Word>
      )
  }
  const look = LOOK[status]
  return (
    <Word tone={look.tone} icon={look.icon}>
      {PRODUCT_STATUS_WORD[status]}
    </Word>
  )
}
