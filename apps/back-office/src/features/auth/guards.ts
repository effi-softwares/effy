import { createSessionGuard } from "@effy/web-kit";

import type { Identity, Session } from "./model";
import { sessionQuery } from "./queries";

// Redirect-and-return-to-intent is identical on every console; the session shape is not.
export const requireSession = createSessionGuard<Identity, Session>(sessionQuery, {
  signInPath: "/auth/sign-in",
});
