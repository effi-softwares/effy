import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";

import * as repo from "./repo";

// Server state lives ONLY in the TanStack Query cache (Principle VI). Mutations INVALIDATE.

export const exceptionKeys = {
  all: ["exceptions"] as const,
  list: (includeResolved: boolean) => ["exceptions", "list", includeResolved] as const,
};

export const exceptionsQuery = (includeResolved: boolean) =>
  queryOptions({
    queryKey: exceptionKeys.list(includeResolved),
    queryFn: () => repo.listExceptions(includeResolved),
  });

/**
 * ⚠ INVALIDATES BOTH LISTS. Resolving moves a row from the open list to the resolved one, so patching
 * only the list currently on screen would leave the other showing an exception in the wrong state —
 * and this is a screen two people may be triaging from at once.
 */
export function useResolveException() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, note }: { id: string; note: string | null }) => repo.resolveException(id, note),
    onSuccess: () => void qc.invalidateQueries({ queryKey: exceptionKeys.all }),
  });
}
