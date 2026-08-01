import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";

import type { SamedayDeclarationInput } from "@effy/shared-types";

import {
  getSamedayDeclaration,
  postcodeCoverage,
  searchLocalities,
  submitSamedayDeclaration,
} from "./repo";

// Server state lives ONLY in the TanStack Query cache (Principle VI).

const DELIVERY_ROOT = ["shop-web", "delivery"] as const;

export const samedayQuery = () =>
  queryOptions({
    queryKey: [...DELIVERY_ROOT, "sameday"] as const,
    queryFn: () => getSamedayDeclaration(),
  });

export const localitySearchQuery = (q: string) =>
  queryOptions({
    queryKey: [...DELIVERY_ROOT, "localities", q] as const,
    queryFn: () => searchLocalities(q),
    enabled: q.trim().length >= 2,
  });

/**
 * ⚠ Keyed on the postcode so each area's disclosure caches independently — and so the notice cannot
 * end up rendering another postcode's coverage while a request is in flight, which would tell a shop
 * it was committing to the wrong twenty places.
 */
export const postcodeCoverageQuery = (postcode: string) =>
  queryOptions({
    queryKey: [...DELIVERY_ROOT, "coverage", postcode] as const,
    queryFn: () => postcodeCoverage(postcode),
    enabled: /^\d{4}$/.test(postcode),
  });

export function useSubmitSameday() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: SamedayDeclarationInput) => submitSamedayDeclaration(body),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: DELIVERY_ROOT }),
  });
}
