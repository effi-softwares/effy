import { isDomainError } from "@effy/api-client";
import { QueryClient } from "@tanstack/react-query";

/**
 * The server-state cache — the source of truth for all server data (constitution Principle VI).
 *
 * A denial is a correct answer, not a transient failure: retrying `forbidden` / `unauthenticated` /
 * `not-found` wastes the operator's time and hammers the gate. Everything else gets two retries,
 * because the cost-optimized backend is allowed to be slow on first wake.
 */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        retry: (failureCount, error) => {
          if (
            isDomainError(error) &&
            (error.kind === "forbidden" ||
              error.kind === "unauthenticated" ||
              error.kind === "not-found")
          ) {
            return false;
          }
          return failureCount < 2;
        },
      },
    },
  });
}
