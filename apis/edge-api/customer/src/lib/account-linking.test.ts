import { describe, expect, it, vi } from "vitest"

import {
  linkFederatedIdentity,
  normaliseEmail,
  parseFederatedUsername,
  type CognitoAdmin,
} from "./account-linking"

function admin(overrides: Partial<CognitoAdmin> = {}): CognitoAdmin {
  return {
    findNativeUserByEmail: vi.fn().mockResolvedValue(null),
    createNativeUser: vi.fn().mockResolvedValue("native-uuid"),
    linkProvider: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  }
}

const base = {
  userPoolId: "ap-southeast-2_TEST",
  federatedUsername: "Google_1029384756",
  email: "shopper@example.com",
  emailVerified: "true",
}

describe("account linking", () => {
  /**
   * ⚠ THE MOST IMPORTANT TESTS IN THE SLICE.
   *
   * Linking on an unverified email hands an attacker JWTs carrying the VICTIM'S `sub`. If any of
   * these ever go green-by-deletion, the platform has an account-takeover hole and no error to
   * show for it.
   */
  describe("REFUSES to link an unverified identity (FR-012)", () => {
    it("refuses when the provider does not assert email_verified", async () => {
      const a = admin()
      const r = await linkFederatedIdentity({ ...base, emailVerified: "false" }, a)

      expect(r.outcome).toBe("refused")
      expect(a.linkProvider).not.toHaveBeenCalled()
      expect(a.createNativeUser).not.toHaveBeenCalled()
    })

    it("refuses when email_verified is absent entirely", async () => {
      const a = admin()
      const r = await linkFederatedIdentity({ ...base, emailVerified: undefined }, a)

      expect(r.outcome).toBe("refused")
      expect(a.linkProvider).not.toHaveBeenCalled()
    })

    it("refuses anything that is not the exact string 'true' — no truthiness games", async () => {
      for (const v of ["TRUE", "1", "yes", "", " true "]) {
        const a = admin()
        const r = await linkFederatedIdentity({ ...base, emailVerified: v }, a)
        expect(r.outcome, `emailVerified=${JSON.stringify(v)} must be refused`).toBe("refused")
        expect(a.linkProvider).not.toHaveBeenCalled()
      }
    })

    it("refuses when the provider supplies no email at all", async () => {
      const a = admin()
      const r = await linkFederatedIdentity({ ...base, email: undefined }, a)

      expect(r.outcome).toBe("refused")
      expect(a.linkProvider).not.toHaveBeenCalled()
    })

    it("refuses an unparseable federated username", async () => {
      const a = admin()
      const r = await linkFederatedIdentity({ ...base, federatedUsername: "Google" }, a)

      expect(r.outcome).toBe("refused")
      expect(a.linkProvider).not.toHaveBeenCalled()
    })
  })

  describe("links a VERIFIED identity into the NATIVE profile", () => {
    it("links to the existing native profile when one exists — one person, one sub", async () => {
      const a = admin({
        findNativeUserByEmail: vi.fn().mockResolvedValue("existing-native-uuid"),
      })

      const r = await linkFederatedIdentity(base, a)

      expect(r.outcome).toBe("linked-to-existing")
      expect(a.createNativeUser).not.toHaveBeenCalled()
      expect(a.linkProvider).toHaveBeenCalledWith({
        userPoolId: base.userPoolId,
        destinationUsername: "existing-native-uuid", // ← the NATIVE profile is the destination
        providerName: "Google",
        providerSub: "1029384756",
      })
    })

    it("creates the native profile FIRST, then links to it, when none exists", async () => {
      const a = admin()

      const r = await linkFederatedIdentity(base, a)

      expect(r.outcome).toBe("created-and-linked")
      expect(a.createNativeUser).toHaveBeenCalledWith(base.userPoolId, base.email)
      // The destination is the freshly-created NATIVE profile — never the federated one. If this
      // ever inverts, `sub` stops surviving the link and every customer record breaks.
      expect(a.linkProvider).toHaveBeenCalledWith(
        expect.objectContaining({ destinationUsername: "native-uuid" }),
      )
    })

    it("matches on a case-insensitively normalised email", async () => {
      const a = admin()
      await linkFederatedIdentity({ ...base, email: "  Shopper@Example.COM " }, a)

      expect(a.findNativeUserByEmail).toHaveBeenCalledWith(
        base.userPoolId,
        "shopper@example.com",
      )
    })
  })
})

describe("parseFederatedUsername", () => {
  it("splits provider from subject", () => {
    expect(parseFederatedUsername("Google_12345")).toEqual({
      provider: "Google",
      sub: "12345",
    })
  })

  it("keeps underscores inside the subject", () => {
    expect(parseFederatedUsername("Google_abc_def")).toEqual({
      provider: "Google",
      sub: "abc_def",
    })
  })

  it("rejects malformed values", () => {
    expect(parseFederatedUsername("Google")).toBeNull()
    expect(parseFederatedUsername("_12345")).toBeNull()
    expect(parseFederatedUsername("Google_")).toBeNull()
  })
})

describe("normaliseEmail", () => {
  it("lowercases and trims", () => {
    expect(normaliseEmail("  A@B.com ")).toBe("a@b.com")
  })
})
