import type { QueryClient } from "@tanstack/react-query";
import { redirect } from "@tanstack/react-router";

/** Route guard factory, generic over the surface's session shape; the redirect-and-return behaviour is shared. */

export interface SessionLike<TIdentity> {
  status: "signed-in" | "signed-out";
  identity?: TIdentity;
}

/**
 * The structural minimum of a `queryOptions({ queryKey, queryFn })` result. Not
 * `Parameters<QueryClient["ensureQueryData"]>[0]`, whose generics collapse to `unknown` and break
 * variance on `staleTime`.
 */
export interface SessionQueryLike {
  queryKey: readonly unknown[];
}

type EnsureQueryDataOptions = Parameters<QueryClient["ensureQueryData"]>[0];

export interface SessionGuardOptions {
  /** Where an unauthenticated visitor is sent. */
  signInPath: string;
}

export function createSessionGuard<TIdentity, TSession extends SessionLike<TIdentity>>(
  sessionQuery: SessionQueryLike,
  { signInPath }: SessionGuardOptions,
) {
  return async function requireSession(
    queryClient: QueryClient,
    href: string,
  ): Promise<TIdentity> {
    const session = (await queryClient.ensureQueryData(
      sessionQuery as EnsureQueryDataOptions,
    )) as TSession;
    if (session.status !== "signed-in" || !session.identity) {
      // `next` carries the intended destination.
      throw redirect({ to: signInPath, search: { next: href } });
    }
    return session.identity;
  };
}
