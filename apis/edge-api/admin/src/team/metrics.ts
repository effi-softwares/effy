import { emitMetric } from "@effy/edge-shared";
import { TEAM_METRIC_NAMESPACE } from "@effy/edge-shared/team";

/** One team change and how it ended (bounded values only: an action word and an outcome). */
export function meterTeamChange(action: string, outcome: "done" | "incomplete" | "refused"): void {
  emitMetric(TEAM_METRIC_NAMESPACE, "TeamChanges", 1, { action, outcome });
}
