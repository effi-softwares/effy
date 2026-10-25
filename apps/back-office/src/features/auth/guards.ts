import { createSessionGuard } from "@effy/web-kit"

import type { Identity, Session } from "./model"
import { sessionQuery } from "./queries"

export const requireSession = createSessionGuard<Identity, Session>(sessionQuery, {
  signInPath: "/auth/sign-in",
})
