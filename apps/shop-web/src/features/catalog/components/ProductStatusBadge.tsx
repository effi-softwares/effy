import type { ProductStatus, ProductStockDTO } from "@effy/shared-types"
import { Archive, ArrowDown, CircleCheck, CircleSlash, PackageX, Pencil, type LucideIcon } from "lucide-react"

import { Badge } from "@effy/design-system/ui"

const PRODUCT_STATUS_WORD: Record<ProductStatus, string> = {
  active: "Live",
  draft: "Draft",
  unavailable: "Unavailable",
  archived: "Archived",
}

type Tone = "success" | "warning" | "quiet" | "destructive"

const LOOK: Record<ProductStatus, { tone: Tone; icon: LucideIcon }> = {
  active: { tone: "success", icon: CircleCheck },
  draft: { tone: "warning", icon: Pencil },
  unavailable: { tone: "quiet", icon: CircleSlash },
  archived: { tone: "quiet", icon: Archive },
}

function Word({ tone, icon: Icon, children }: { tone: Tone; icon: LucideIcon; children: string }) {
  return (
    <Badge variant={tone}>
      <Icon aria-hidden="true" />
      {children}
    </Badge>
  )
}

export function ProductStatusBadge({ status, stock }: { status: ProductStatus; stock?: ProductStockDTO }) {
  if (status === "active" && stock?.tracked) {
    if (stock.outOfStock)
      return (
        <Word tone="destructive" icon={PackageX}>
          Out of stock
        </Word>
      )
    if (stock.low)
      return (
        <Word tone="warning" icon={ArrowDown}>
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
