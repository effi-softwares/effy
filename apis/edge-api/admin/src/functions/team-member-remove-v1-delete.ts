import { adminRoute, staffIdOf } from "../team/handler-support";
import { team } from "../team/service";

/** DELETE /admin/v1/staff/{staffId}?expectedRevision= - remove a disabled person; the record is kept (119 US5). */
export const handler = adminRoute((event, caller) =>
  team.remove(caller, staffIdOf(event), event.queryStringParameters?.expectedRevision),
);
