import { adminRoute, bodyOf, staffIdOf } from "../team/handler-support";
import { team } from "../team/service";

/** POST /admin/v1/staff/{staffId}/repair - make the sign-in account match the record (119 US7). */
export const handler = adminRoute((event, caller) => team.repair(caller, staffIdOf(event), bodyOf(event)));
