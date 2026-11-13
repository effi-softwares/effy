import { adminRoute, bodyOf, staffIdOf } from "../team/handler-support";
import { team } from "../team/service";

/** PUT /admin/v1/staff/{staffId}/role - change the one role (119 US3). */
export const handler = adminRoute((event, caller) => team.changeRole(caller, staffIdOf(event), bodyOf(event)));
