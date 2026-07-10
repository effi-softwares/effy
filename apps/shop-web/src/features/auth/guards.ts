import { createSessionGuard } from "@effy/web-kit";

import type { Identity, Session } from "./model";
import { sessionQuery } from "./queries";

// Redirect-and-return-to-intent is identical on every console; the session shape is not.
// An unauthenticated visitor reaching a protected route (deep link, back button) is sent to
// sign-in with `next`, and returned there afterwards (FR-004 / SC-010).
export const requireSession = createSessionGuard<Identity, Session>(sessionQuery, {
  signInPath: "/auth/sign-in",
});
