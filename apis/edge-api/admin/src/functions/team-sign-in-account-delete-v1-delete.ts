import { adminRoute } from "../team/handler-support";
import { team } from "../team/service";

/** DELETE /admin/v1/staff/sign-in-accounts/{username} - a sign-in account with no record (119 FR-031). */
export const handler = adminRoute(async (event, caller) => {
  await team.deleteOrphan(caller, decodeURIComponent(event.pathParameters?.username ?? ""));
  return { deleted: true };
});
