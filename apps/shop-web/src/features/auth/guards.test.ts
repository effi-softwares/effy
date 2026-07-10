import type { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

import type { Session } from "./model";
import { requireSession } from "./guards";

// The guard never calls Amplify (ensureQueryData is stubbed), so keep the SDK out of the test.
vi.mock("aws-amplify/auth", () => ({
  signIn: vi.fn(),
  confirmSignIn: vi.fn(),
  signOut: vi.fn(),
  fetchAuthSession: vi.fn(),
}));

function fakeQueryClient(session: Session): QueryClient {
  return { ensureQueryData: vi.fn().mockResolvedValue(session) } as unknown as QueryClient;
}

describe("requireSession (shop-web)", () => {
  it("returns the identity when signed in", async () => {
    const identity = {
      subject: "sub-1",
      email: "sam@effy.test",
      roles: ["shop_manager" as const],
    };
    const result = await requireSession(fakeQueryClient({ status: "signed-in", identity }), "/");
    expect(result).toEqual(identity);
  });

  // FR-004 / SC-010: a deep link while signed out returns the operator to where they were headed.
  it("redirects to sign-in preserving the intended destination", async () => {
    await expect(
      requireSession(fakeQueryClient({ status: "signed-out" }), "/manager"),
    ).rejects.toMatchObject({
      options: { to: "/auth/sign-in", search: { next: "/manager" } },
    });
  });
});
