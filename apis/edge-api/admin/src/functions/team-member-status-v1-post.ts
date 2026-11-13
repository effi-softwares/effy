import { adminRoute, bodyOf, staffIdOf } from "../team/handler-support";
import { team } from "../team/service";

/** POST /admin/v1/staff/{staffId}/status - disable or re-enable (119 US2): one fact, one route. */
export const handler = adminRoute((event, caller) => team.setStatus(caller, staffIdOf(event), bodyOf(event)));
