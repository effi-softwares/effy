import { useCallback } from "react"

import { useQueryClient } from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"
import { toast } from "@effy/design-system/ui"

import { productListQuery } from "@/features/catalog/queries"
import { orderListQuery } from "@/features/fulfillment/queries"

const NONE: Record<"order" | "product", string> = {
  order: "There's no order to show this tour on yet.",
  product: "There's no product to show this tour on yet.",
}

/**
 * For a tour that needs a record (106 FR-007): open the most recently placed order, or the most recently added
 * product. With none, say so and start nothing.
 */
export function useOpenRecord() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  return useCallback(
    async (kind: "order" | "product"): Promise<boolean> => {
      try {
        if (kind === "order") {
          const page = await queryClient.fetchQuery(orderListQuery({ sort: "placed", dir: "desc" }))
          const first = page.items[0]
          if (first) {
            await navigate({ to: "/orders/$fulfillmentId", params: { fulfillmentId: first.id } })
            return true
          }
        } else {
          const page = await queryClient.fetchQuery(
            productListQuery({ page: 1, pageSize: 1, sort: "recent", order: "desc" }),
          )
          const first = page.items[0]
          if (first) {
            await navigate({ to: "/catalog/$productId", params: { productId: first.id } })
            return true
          }
        }
      } catch {
        // A failed read is the same answer for the person: nothing to show the tour on now.
      }
      toast(NONE[kind])
      return false
    },
    [queryClient, navigate],
  )
}
