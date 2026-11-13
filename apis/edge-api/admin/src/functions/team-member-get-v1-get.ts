import { adminRoute, staffIdOf } from "../team/handler-support";
import { team } from "../team/service";

/** GET /admin/v1/staff/{staffId} - a team member's page; `actions` are what the server will allow (119). */
export const handler = adminRoute((event, caller) => team.get(caller, staffIdOf(event)));
