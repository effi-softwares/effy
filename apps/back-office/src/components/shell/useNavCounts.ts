import { useQuery } from "@tanstack/react-query"

import { deliverabilityListQuery } from "@/features/deliverability/queries"
import { dispatchDayQuery } from "@/features/dispatch/queries"
import { exceptionsQuery } from "@/features/exceptions/queries"
import { feedbackListQuery } from "@/features/feedback/queries"
import { reviewQueueQuery } from "@/features/product-review/queries"

import type { NavCountKey } from "./nav"

export function useNavCounts(enabled: boolean): Partial<Record<NavCountKey, number>> {
  const day = useQuery({ ...dispatchDayQuery(), enabled })
  const exceptions = useQuery({ ...exceptionsQuery(), enabled })
  const review = useQuery({ ...reviewQueueQuery({}), enabled })
  const feedback = useQuery({ ...feedbackListQuery({ status: "new" }), enabled })
  const deliverability = useQuery({ ...deliverabilityListQuery({}), enabled })

  const ex = exceptions.data
  return {
    // Work nobody is collecting or delivering yet.
    dispatch: day.data ? day.data.unassigned.length : undefined,
    exceptions: ex
      ? Number(ex.openCount) +
        (ex.held?.length ?? 0) +
        (ex.overdue?.length ?? 0) +
        (ex.vehicleChecks?.filter((c) => c.unsafe && c.clearedAt === null).length ?? 0)
      : undefined,
    review: review.data?.total,
    feedback: feedback.data?.total,
    // The page's default view: addresses having trouble or undeliverable.
    deliverability: deliverability.data?.total,
  }
}
