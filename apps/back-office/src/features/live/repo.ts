import { isDomainError } from "@effy/api-client";
import type { LiveDescriptor } from "@effy/shared-types";

import { api } from "@/lib/api";

// The data layer for the live channel (071): where back-office's operations channel is.
//
// ⚠ "NO CHANNEL" IS AN ANSWER, NOT A FAILURE. 204 (none in this environment), 403 (not an active
// account) and 404 (a backend that predates the route) all resolve `null`: the console then says
// live updates are off and reads on open, on return and on request. Only a failure to FIND OUT —
// the network, a 5xx — throws, and that is what gets retried.
export async function getLiveDescriptor(): Promise<LiveDescriptor | null> {
  try {
    return (await api.get<LiveDescriptor | undefined>("/admin/v1/live")) ?? null;
  } catch (err) {
    if (
      isDomainError(err) &&
      (err.kind === "forbidden" || err.kind === "not-found" || err.kind === "unauthenticated")
    ) {
      return null;
    }
    throw err;
  }
}
