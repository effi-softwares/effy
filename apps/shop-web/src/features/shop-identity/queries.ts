import { queryOptions } from "@tanstack/react-query";

import { loadManagerPing, loadMe } from "./repo";

// Server-state cache = source of truth. The `shop` key prefix lets sign-out drop every shop read
// at once (see useSignOut).
export const meQuery = queryOptions({
  queryKey: ["shop", "me"] as const,
  queryFn: loadMe,
});

export const managerPingQuery = queryOptions({
  queryKey: ["shop", "manager-ping"] as const,
  queryFn: loadManagerPing,
});
