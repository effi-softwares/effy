import { adminRoute, staffIdOf } from "../team/handler-support";
import { team } from "../team/service";

/** POST /admin/v1/staff/{staffId}/sign-out - end every session; access unchanged (119 US6). */
export const handler = adminRoute((event, caller) => team.signOut(caller, staffIdOf(event)));
