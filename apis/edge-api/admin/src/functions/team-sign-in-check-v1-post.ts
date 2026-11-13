import { adminRoute } from "../team/handler-support";
import { team } from "../team/service";

/** POST /admin/v1/staff/sign-in-check - compare the sign-in pool with the records; skipped within 60 s (119 R6). */
export const handler = adminRoute(() => team.checkSignIn());
