import { queryOptions, type QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

import { createSessionGuard, type SessionLike } from "./guards";

// The guard never calls Amplify (ensureQueryData is stubbed), so keep the SDK out of the test.
vi.mock("aws-amplify/auth", () => ({
  signIn: vi.fn(),
  confirmSignIn: vi.fn(),
  signOut: vi.fn(),
  fetchAuthSession: vi.fn(),
}));

interface Identity {
  subject: string;
  email: string;
  roles: readonly string[];
}
type Session = SessionLike<Identity>;

const sessionQuery = queryOptions({
  queryKey: ["auth", "session"] as const,
  queryFn: async (): Promise<Session> => ({ status: "signed-out" }),
});
const requireSession = createSessionGuard<Identity, Session>(sessionQuery, {
  signInPath: "/auth/sign-in",
});

function fakeQueryClient(session: Session): QueryClient {
  return { ensureQueryData: vi.fn().mockResolvedValue(session) } as unknown as QueryClient;
}

describe("createSessionGuard", () => {
  it("returns the identity when signed in", async () => {
    const identity: Identity = { subject: "sub-1", email: "op@effy.test", roles: ["store_manager"] };
    const result = await requireSession(fakeQueryClient({ status: "signed-in", identity }), "/");
    expect(result).toEqual(identity);
  });

  // FR-004 / SC-010: the operator lands where they meant to go, not on the dashboard.
  it("throws a redirect to sign-in, preserving the intended destination", async () => {
    await expect(
      requireSession(fakeQueryClient({ status: "signed-out" }), "/manager"),
    ).rejects.toMatchObject({
      options: { to: "/auth/sign-in", search: { next: "/manager" } },
    });
  });

  it("redirects when the session claims signed-in but carries no identity", async () => {
    await expect(
      requireSession(fakeQueryClient({ status: "signed-in" }), "/manager"),
    ).rejects.toMatchObject({ options: { to: "/auth/sign-in" } });
  });
});
