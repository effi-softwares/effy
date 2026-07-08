import { isDomainError } from "@effy/api-client";
import { QueryClient } from "@tanstack/react-query";

// The one QueryClient — the server-state cache is the source of truth (Principle VI). Handed into
// the router context so route loaders can prime data. Auth/permission errors are never retried;
// transient unavailability retries a couple times (contracts/back-office-web §4).
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
