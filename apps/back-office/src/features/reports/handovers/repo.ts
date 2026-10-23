import type { HandoverReportDTO } from "@effy/shared-types";

import { api } from "@/lib/api";

// The hand-over report (fleet, staff gateway).
export function getHandoverReport(from: string, to: string): Promise<HandoverReportDTO> {
  return api.get<HandoverReportDTO>(`/fleet/v1/reports/handovers?${new URLSearchParams({ from, to })}`);
}
