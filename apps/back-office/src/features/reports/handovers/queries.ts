import { keepPreviousData, queryOptions } from "@tanstack/react-query"

import { getHandoverReport } from "./repo"

export const handoverReportQuery = (from: string, to: string) =>
  queryOptions({
    queryKey: ["dispatch", "reports", "handovers", from, to] as const,
    queryFn: () => getHandoverReport(from, to),
    placeholderData: keepPreviousData,
  })
