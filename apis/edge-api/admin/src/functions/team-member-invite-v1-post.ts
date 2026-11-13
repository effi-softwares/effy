import { adminRoute, staffIdOf } from "../team/handler-support";
import { team } from "../team/service";

/** POST /admin/v1/staff/{staffId}/invitation - send the invitation (again), at most once per five minutes (119 US6). */
export const handler = adminRoute((event, caller) => team.invite(caller, staffIdOf(event)));
