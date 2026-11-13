import { adminRoute, bodyOf } from "../team/handler-support";
import { team } from "../team/service";

/** POST /admin/v1/staff - add a person with one role, optionally invited (119 US1). */
export const handler = adminRoute((event, caller) => team.add(caller, bodyOf(event)), 201);
