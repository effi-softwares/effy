import { pooled } from "@effy/edge-shared";

import { adminRoute } from "../team/handler-support";
import { listTeam } from "../team/list";

/** GET /admin/v1/staff - the People list (119; 103), plus the accounts with no record. Administrators only. */
export const handler = adminRoute((event) => listTeam(pooled, event.queryStringParameters));
