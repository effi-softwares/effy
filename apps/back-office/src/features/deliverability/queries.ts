import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";

import { getDeliverability, listDeliverability, repairDeliverability } from "./repo";
import type { DeliveryListParams } from "./model";

// Server state lives ONLY in the TanStack Query cache (Principle VI).
const ROOT = ["back-office", "deliverability"] as const;

export const deliverabilityListQuery = (params: DeliveryListParams) =>
  queryOptions({
    queryKey: [...ROOT, "list", params] as const,
    queryFn: () => listDeliverability(params),
  });

export const deliverabilityDetailQuery = (address: string) =>
  queryOptions({
    queryKey: [...ROOT, "detail", address] as const,
    queryFn: () => getDeliverability(address),
    // ⚠ Never cached across a repair: `suppressedInSes` is read LIVE from the mail service on every
    // request, and a stale "still suppressed" would make an operator repeat a repair that worked.
    staleTime: 0,
  });

export function useRepairDeliverability(address: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (note: string) => repairDeliverability(address, note),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ROOT });
    },
  });
}
