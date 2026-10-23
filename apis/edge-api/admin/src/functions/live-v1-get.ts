// Every active back-office account hears the one operations channel; each route still decides what a role may read.
import { liveRoute, opsScope, OPS_SCOPE_ID } from "@effy/edge-shared/live";

export const handler = liveRoute("ops", async (sub) => ((await opsScope(sub)) ? OPS_SCOPE_ID : null));
