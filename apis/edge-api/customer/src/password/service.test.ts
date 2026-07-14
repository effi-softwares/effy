import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("../customer/repo")
vi.mock("./cognito")
vi.mock("./notify")
vi.mock("@effy/edge-shared", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  isPasswordBreached: vi.fn(),
}))

import { BreachCheckUnavailableError, isPasswordBreached } from "@effy/edge-shared"

import { findByCognitoSub, markPasswordSet } from "../customer/repo"
import * as cognito from "./cognito"
import {
  CustomerBarredError,
  PasswordPolicyError,
  sendPasswordChallenge,
  WrongModeError,
  writePassword,
} from "./service"

const SUB = "sub-123"
const TOKEN = "access-token"
const GOOD = "a-perfectly-fine-passphrase" // ≥ 12 chars

function row(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: "id-1",
    cognito_sub: SUB,
    email: "shopper@example.com",
    given_name: "Janith",
    family_name: "M",
    status: "active",
    has_password: false,
    password_updated_at: null,
    created_at: new Date("2026-01-01"),
    updated_at: new Date("2026-01-01"),
    ...over,
  } as never
}

beforeEach(() => {
  // ⚠ Without this, call COUNTS accumulate across tests and every `not.toHaveBeenCalled()`
  // assertion below silently stops meaning anything — which is most of this file's value.
  vi.clearAllMocks()
  vi.mocked(isPasswordBreached).mockResolvedValue(false)
  vi.mocked(markPasswordSet).mockResolvedValue(row({ has_password: true }))
})

describe("writePassword — mode: set (THE SECURITY CORE, SC-004)", () => {
  it("verifies the step-up code BEFORE writing the password", async () => {
    vi.mocked(findByCognitoSub).mockResolvedValue(row({ has_password: false }))
    const order: string[] = []
    vi.mocked(cognito.verifyEmailCode).mockImplementation(async () => void order.push("verify"))
    vi.mocked(cognito.unsafeSetFirstPassword).mockImplementation(
      async () => void order.push("write"),
    )

    await writePassword(SUB, TOKEN, { mode: "set", code: "123456", newPassword: GOOD })

    // ⚠ THE ASSERTION THIS WHOLE SLICE EXISTS FOR. If these ever invert, a session alone can plant a
    // password on a passwordless account and the true owner never finds out.
    expect(order).toEqual(["verify", "write"])
  })

  it("NEVER writes the password when the step-up code is rejected", async () => {
    vi.mocked(findByCognitoSub).mockResolvedValue(row({ has_password: false }))
    vi.mocked(cognito.verifyEmailCode).mockRejectedValue(
      Object.assign(new Error("bad code"), { name: "CodeMismatchException" }),
    )

    await expect(
      writePassword(SUB, TOKEN, { mode: "set", code: "000000", newPassword: GOOD }),
    ).rejects.toThrow()

    // A valid session, without the inbox, buys NOTHING.
    expect(cognito.unsafeSetFirstPassword).not.toHaveBeenCalled()
    expect(markPasswordSet).not.toHaveBeenCalled()
  })

  it("revokes every session and records the state after a successful set", async () => {
    vi.mocked(findByCognitoSub).mockResolvedValue(row({ has_password: false }))
    vi.mocked(cognito.verifyEmailCode).mockResolvedValue(undefined)
    vi.mocked(cognito.unsafeSetFirstPassword).mockResolvedValue(undefined)

    await writePassword(SUB, TOKEN, { mode: "set", code: "123456", newPassword: GOOD })

    expect(cognito.globalSignOut).toHaveBeenCalledWith(TOKEN) // FR-024
    expect(markPasswordSet).toHaveBeenCalledWith(SUB) // FR-013
  })

  // FR-014 — the platform refuses the flow that does not apply, even though no UI would offer it.
  // A Server Action is a public endpoint; so is this.
  it("refuses `set` on an account that ALREADY has a password", async () => {
    vi.mocked(findByCognitoSub).mockResolvedValue(row({ has_password: true }))

    await expect(
      writePassword(SUB, TOKEN, { mode: "set", code: "123456", newPassword: GOOD }),
    ).rejects.toBeInstanceOf(WrongModeError)
    expect(cognito.unsafeSetFirstPassword).not.toHaveBeenCalled()
  })
})

describe("writePassword — mode: change (SC-005)", () => {
  it("refuses `change` on an account that has NO password", async () => {
    vi.mocked(findByCognitoSub).mockResolvedValue(row({ has_password: false }))

    await expect(
      writePassword(SUB, TOKEN, { mode: "change", currentPassword: "x", newPassword: GOOD }),
    ).rejects.toBeInstanceOf(WrongModeError)
    expect(cognito.changePassword).not.toHaveBeenCalled()
  })

  it("hands the CURRENT password to Cognito, which verifies it (FR-016)", async () => {
    vi.mocked(findByCognitoSub).mockResolvedValue(row({ has_password: true }))
    vi.mocked(cognito.changePassword).mockResolvedValue(undefined)

    await writePassword(SUB, TOKEN, {
      mode: "change",
      currentPassword: "the-old-one",
      newPassword: GOOD,
    })

    expect(cognito.changePassword).toHaveBeenCalledWith(TOKEN, "the-old-one", GOOD)
    // ⚠ The set path must NEVER be reachable from a `change` request — it is the one that omits the
    // previous password.
    expect(cognito.unsafeSetFirstPassword).not.toHaveBeenCalled()
  })

  it("propagates Cognito's refusal of a wrong current password", async () => {
    vi.mocked(findByCognitoSub).mockResolvedValue(row({ has_password: true }))
    vi.mocked(cognito.changePassword).mockRejectedValue(
      Object.assign(new Error("nope"), { name: "NotAuthorizedException" }),
    )

    await expect(
      writePassword(SUB, TOKEN, { mode: "change", currentPassword: "wrong", newPassword: GOOD }),
    ).rejects.toMatchObject({ name: "NotAuthorizedException" })
    expect(markPasswordSet).not.toHaveBeenCalled()
  })
})

describe("the password rules (FR-022) run BEFORE Cognito is touched", () => {
  it("refuses a password shorter than 12 characters", async () => {
    vi.mocked(findByCognitoSub).mockResolvedValue(row({ has_password: true }))

    await expect(
      writePassword(SUB, TOKEN, { mode: "change", currentPassword: "x", newPassword: "short1!" }),
    ).rejects.toBeInstanceOf(PasswordPolicyError)
    expect(cognito.changePassword).not.toHaveBeenCalled()
  })

  it("refuses a password known to be in a public breach", async () => {
    vi.mocked(findByCognitoSub).mockResolvedValue(row({ has_password: true }))
    vi.mocked(isPasswordBreached).mockResolvedValue(true)

    await expect(
      writePassword(SUB, TOKEN, { mode: "change", currentPassword: "x", newPassword: GOOD }),
    ).rejects.toBeInstanceOf(PasswordPolicyError)
    expect(cognito.changePassword).not.toHaveBeenCalled()
  })

  // ⚠ FAIL CLOSED. A third-party outage must not silently disable the platform's only defence
  // against breached passwords — least of all at a moment when nobody is watching.
  it("refuses the password when the breach service is UNAVAILABLE (fail-closed, FR-022a)", async () => {
    vi.mocked(findByCognitoSub).mockResolvedValue(row({ has_password: true }))
    vi.mocked(isPasswordBreached).mockRejectedValue(new BreachCheckUnavailableError())

    await expect(
      writePassword(SUB, TOKEN, { mode: "change", currentPassword: "x", newPassword: GOOD }),
    ).rejects.toBeInstanceOf(PasswordPolicyError)
    expect(cognito.changePassword).not.toHaveBeenCalled()
  })
})

describe("the barred customer (FR-034 / SC-009)", () => {
  it("is refused the challenge, however valid their credential", async () => {
    vi.mocked(findByCognitoSub).mockResolvedValue(row({ status: "barred" }))
    await expect(sendPasswordChallenge(SUB, TOKEN)).rejects.toBeInstanceOf(CustomerBarredError)
    expect(cognito.sendEmailVerificationCode).not.toHaveBeenCalled()
  })

  it("is refused the password write, however valid their credential", async () => {
    vi.mocked(findByCognitoSub).mockResolvedValue(row({ status: "barred", has_password: true }))
    await expect(
      writePassword(SUB, TOKEN, { mode: "change", currentPassword: "x", newPassword: GOOD }),
    ).rejects.toBeInstanceOf(CustomerBarredError)
    expect(cognito.changePassword).not.toHaveBeenCalled()
  })
})

describe("sendPasswordChallenge", () => {
  it("grants nothing — it only sends a code, and returns a MASKED destination", async () => {
    vi.mocked(findByCognitoSub).mockResolvedValue(row({ has_password: false }))
    vi.mocked(cognito.sendEmailVerificationCode).mockResolvedValue(undefined)

    const res = await sendPasswordChallenge(SUB, TOKEN)

    expect(res.maskedDestination).toBe("s•••@example.com")
    expect(res.maskedDestination).not.toContain("shopper")
  })

  it("refuses to send a set-password code to an account that already has a password", async () => {
    vi.mocked(findByCognitoSub).mockResolvedValue(row({ has_password: true }))
    await expect(sendPasswordChallenge(SUB, TOKEN)).rejects.toBeInstanceOf(WrongModeError)
  })
})
