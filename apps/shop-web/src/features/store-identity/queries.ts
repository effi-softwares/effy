import { queryOptions } from "@tanstack/react-query";

import { loadManagerPing, loadMe } from "./repo";

// Server-state cache = source of truth. The `store` key prefix lets sign-out drop every store read
// at once (see useSignOut).
export const meQuery = queryOptions({
  queryKey: ["store", "me"] as const,
  queryFn: loadMe,
});

export const managerPingQuery = queryOptions({
  queryKey: ["store", "manager-ping"] as const,
  queryFn: loadManagerPing,
});
