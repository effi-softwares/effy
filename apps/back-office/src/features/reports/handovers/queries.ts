import { keepPreviousData, queryOptions } from "@tanstack/react-query";

import { getHandoverReport } from "./repo";

// Under "dispatch": a live dispatch change re-reads it (features/live/routes.ts), with no new mapping.
export const handoverReportQuery = (from: string, to: string) =>
  queryOptions({
    queryKey: ["dispatch", "reports", "handovers", from, to] as const,
    queryFn: () => getHandoverReport(from, to),
    placeholderData: keepPreviousData,
  });
