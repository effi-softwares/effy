import { isDomainError } from "@effy/api-client";
import { QueryClient } from "@tanstack/react-query";

/**
 * The server-state cache, the source of truth for server data. Denials (`forbidden`, `unauthenticated`,
 * `not-found`) are answers and are not retried; everything else gets two retries for a slow first wake.
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
