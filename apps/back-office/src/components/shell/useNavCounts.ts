import { useQuery } from "@tanstack/react-query";

import { deliverabilityListQuery } from "@/features/deliverability/queries";
import { dispatchDayQuery } from "@/features/dispatch/queries";
import { exceptionsQuery } from "@/features/exceptions/queries";
import { feedbackListQuery } from "@/features/feedback/queries";
import { reviewQueueQuery } from "@/features/product-review/queries";

import type { NavCountKey } from "./nav";

/**
 * The rail's live counts — "the ones that need a person".
 *
 * Each count is the page's own query, not a second definition. A badge that says 4 beside Dispatch
 * while Dispatch lists 5 teaches people to ignore badges. So every number here is read through the
 * same query factory the page uses — the same endpoint, the same cache tree — and it refreshes when
 * that tree does: on a live update (features/live/routes.ts) or after a mutation invalidates it.
 * Nothing here polls.
 *
 * A query that fails, or a server that predates a count, yields `undefined` — no badge, never a 0
 * that is not true.
 */
export function useNavCounts(enabled: boolean): Partial<Record<NavCountKey, number>> {
  const day = useQuery({ ...dispatchDayQuery(), enabled });
  const exceptions = useQuery({ ...exceptionsQuery(false), enabled });
  const review = useQuery({ ...reviewQueueQuery({}), enabled });
  const feedback = useQuery({ ...feedbackListQuery({ status: "new", limit: 1 }), enabled });
  const deliverability = useQuery({ ...deliverabilityListQuery({ limit: 1 }), enabled });

  const ex = exceptions.data;
  return {
    // Work nobody is collecting or delivering yet.
    dispatch: day.data ? day.data.unassigned.length : undefined,
    // Everything the Exceptions page asks a person to decide: open failures, packages declared missing,
    // runs whose next step is overdue, and vehicles found unsafe that nobody has cleared.
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
  };
}
