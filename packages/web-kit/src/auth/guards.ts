import type { QueryClient } from "@tanstack/react-query";
import { redirect } from "@tanstack/react-router";

/**
 * Route guard factory — generic over the surface's session/identity shape.
 *
 * A surface supplies its own `sessionQuery` (its roles differ); the redirect-and-return-to-intent
 * behavior is identical everywhere, so it lives here.
 */

export interface SessionLike<TIdentity> {
  status: "signed-in" | "signed-out";
  identity?: TIdentity;
}

/**
 * The structural minimum of a `queryOptions({ queryKey, queryFn })` result.
 *
 * Deliberately not `Parameters<QueryClient["ensureQueryData"]>[0]`: that instantiation collapses
 * the option generics to `unknown`, and a concretely-typed `sessionQuery` then fails variance on
 * `staleTime`. A surface hands its own options object in; the guard only ever needs the key.
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
      // `next` carries the intended destination so the operator lands where they meant to go.
      throw redirect({ to: signInPath, search: { next: href } });
    }
    return session.identity;
  };
}
