import { queryOptions } from "@tanstack/react-query";

import { loadAdminPing, loadMe } from "./repo";

export const meQuery = queryOptions({
  queryKey: ["back-office", "me"] as const,
  queryFn: loadMe,
});

export const adminPingQuery = queryOptions({
  queryKey: ["back-office", "admin-ping"] as const,
  queryFn: loadAdminPing,
});
