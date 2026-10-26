import { AGE_RESTRICTED_LABEL } from "@effy/shared-types"

import { Badge } from "@/components/ui/badge"

/**
 * "18+" on an age-restricted product (101): a neutral label wherever the product is shown — card,
 * product page, cart, checkout and order lines. Labelling only; age checks come later.
 */
export function AgeBadge({ className }: { className?: string }) {
  return (
    <Badge variant="outline" className={className} aria-label="18 or over only">
      {AGE_RESTRICTED_LABEL}
    </Badge>
  )
}
