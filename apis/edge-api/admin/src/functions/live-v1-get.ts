// GET /admin/v1/live — the live-update channel for back-office (071).
//
// Read once on sign-in and after a reconnect, never on a timer. Every ACTIVE back-office account,
// whatever its role, hears the one operations channel — the same gate as every back-office read
// (`isActiveStaff`), and the same rule the live authorizer applies (`opsScope`). An update says
// only what kind of thing changed; what a role may then READ is decided, as ever, by each route.
import { liveRoute, opsScope, OPS_SCOPE_ID } from "@effy/edge-shared/live";

export const handler = liveRoute("ops", async (sub) => ((await opsScope(sub)) ? OPS_SCOPE_ID : null));
