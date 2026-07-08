import type { QueryClient } from "@tanstack/react-query";
import { redirect } from "@tanstack/react-router";

import type { Identity } from "./model";
import { sessionQuery } from "./queries";

// Protected `beforeLoad` guard: ensure a signed-in session or redirect to sign-in, preserving the
// intended destination in `next` (FR-004). Returns the Identity for the route to render.
export async function requireSession(
  queryClient: QueryClient,
  href: string,
): Promise<Identity> {
  const session = await queryClient.ensureQueryData(sessionQuery);
  if (session.status !== "signed-in") {
    throw redirect({ to: "/auth/sign-in", search: { next: href } });
  }
  return session.identity;
}
