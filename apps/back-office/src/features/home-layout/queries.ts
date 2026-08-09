import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";

import { getAudit, getLayout, publish, revert, saveDraft } from "./repo";
import type { HomeLayout } from "./model-types";

// Server state lives ONLY in the TanStack Query cache (Principle VI).
//
// ⚠ EVERY MUTATION INVALIDATES RATHER THAN PATCHING THE CACHE, and here that is load-bearing rather
// than stylistic. The server returns a NEW REVISION on every write, and the next write is refused
// unless it carries the current one. A hand-patched cache that kept a stale revision would make the
// operator's next save fail with a conflict they did not cause and cannot explain — the concurrency
// control firing on a single user working alone.

const LAYOUT_ROOT = ["back-office", "home-layout"] as const;

export const homeLayoutQuery = () =>
  queryOptions({
    queryKey: [...LAYOUT_ROOT, "layout"] as const,
    queryFn: () => getLayout(),
  });

export const homeLayoutAuditQuery = () =>
  queryOptions({
    queryKey: [...LAYOUT_ROOT, "audit"] as const,
    queryFn: () => getAudit(),
  });

export function useSaveDraft() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { blocks: HomeLayout["draft"]; revision: number }) => saveDraft(input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: LAYOUT_ROOT });
    },
  });
}

export function usePublish() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { revision: number }) => publish(input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: LAYOUT_ROOT });
    },
  });
}

export function useRevert() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { revision: number }) => revert(input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: LAYOUT_ROOT });
    },
  });
}
