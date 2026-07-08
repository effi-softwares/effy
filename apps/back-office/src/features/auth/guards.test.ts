import type { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

import type { Session } from "./model";
import { requireSession } from "./guards";

// Avoid pulling the Amplify SDK into the test — the guard never calls it (ensureQueryData is stubbed).
vi.mock("aws-amplify/auth", () => ({
  signIn: vi.fn(),
  confirmSignIn: vi.fn(),
  signOut: vi.fn(),
  fetchAuthSession: vi.fn(),
}));

function fakeQueryClient(session: Session): QueryClient {
  return { ensureQueryData: vi.fn().mockResolvedValue(session) } as unknown as QueryClient;
}

describe("requireSession", () => {
  it("returns the identity when signed in", async () => {
    const identity = { subject: "sub-1", email: "op@effy.test", roles: ["admin" as const] };
    const result = await requireSession(
      fakeQueryClient({ status: "signed-in", identity }),
      "/",
    );
    expect(result).toEqual(identity);
  });

  it("throws a redirect (to sign-in, preserving next) when signed out", async () => {
    await expect(
      requireSession(fakeQueryClient({ status: "signed-out" }), "/reports"),
    ).rejects.toMatchObject({
      options: { to: "/auth/sign-in", search: { next: "/reports" } },
    });
  });
});
