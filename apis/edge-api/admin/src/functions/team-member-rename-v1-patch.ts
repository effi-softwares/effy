import { adminRoute, bodyOf, staffIdOf } from "../team/handler-support";
import { team } from "../team/service";

/** PATCH /admin/v1/staff/{staffId} - an Administrator corrects anyone's name (119 US8). */
export const handler = adminRoute((event, caller) => team.rename(caller, staffIdOf(event), bodyOf(event)));
