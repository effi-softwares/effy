import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("./repo", () => ({
  upsertCustomer: vi.fn(),
  updateProfile: vi.fn(),
}))

import { upsertCustomer, updateProfile } from "./repo"
import {
  CustomerBarredError,
  CustomerClosingError,
  CustomerNotFoundError,
  getOrCreateCustomer,
  updateCustomerProfile,
} from "./service"

import type { CustomerRow } from "./model"

const row = (over: Partial<CustomerRow> = {}): CustomerRow => ({
  id: "c-1",
  cognito_sub: "sub-1",
  email: "shopper@example.com",
  // No outcome recorded, the common case.
  email_delivery: null,
  given_name: "Janith",
  family_name: "Madarasinghe",
  phone: null,
  status: "active",
  closure_state: "open",
  // Platform-owned password state; `false`/`null` (never had one) is a complete state.
  has_password: false,
  password_updated_at: null,
  created_at: new Date("2026-07-14T00:00:00Z"),
  updated_at: new Date("2026-07-14T00:00:00Z"),
  ...over,
})

const identity = {
  sub: "sub-1",
  email: "shopper@example.com",
  givenName: "Janith",
  familyName: "Madarasinghe",
}

beforeEach(() => vi.clearAllMocks())

describe("getOrCreateCustomer", () => {
  it("returns the PLATFORM RECORD, not the token's claims", async () => {
    // The record says "Janith" and active; the token's claims are irrelevant.
    vi.mocked(upsertCustomer).mockResolvedValue(row())

    const dto = await getOrCreateCustomer(identity)

    expect(dto).toEqual({
      id: "c-1",
      email: "shopper@example.com",
      givenName: "Janith",
      familyName: "Madarasinghe",
      phone: null,
      status: "active",
      closureState: "open",
      hasPassword: false,
      passwordUpdatedAt: null,
      // No outcome recorded: absence of evidence is not failure.
      emailDelivery: "reachable",
      createdAt: "2026-07-14T00:00:00.000Z",
    })
  })

  it("never leaks cognito_sub over the wire", async () => {
    vi.mocked(upsertCustomer).mockResolvedValue(row())
    const dto = await getOrCreateCustomer(identity)
    expect(dto).not.toHaveProperty("cognito_sub")
  })

  /** A valid token is not enough: the record can bar a customer. */
  it("REFUSES a barred customer holding a completely valid token", async () => {
    vi.mocked(upsertCustomer).mockResolvedValue(row({ status: "barred" }))

    await expect(getOrCreateCustomer(identity)).rejects.toBeInstanceOf(CustomerBarredError)
  })

  it("upserts BEFORE checking the ban, so a first-time visitor has a record to check", async () => {
    vi.mocked(upsertCustomer).mockResolvedValue(row())
    await getOrCreateCustomer(identity)

    expect(upsertCustomer).toHaveBeenCalledWith({
      cognitoSub: "sub-1",
      email: "shopper@example.com",
      givenName: "Janith",
      familyName: "Madarasinghe",
    })
  })

  it("tolerates a customer with no name - a FEDERATED identity may supply neither", async () => {
    // The platform must not invent a name it was never given.
    vi.mocked(upsertCustomer).mockResolvedValue(
      row({ given_name: null, family_name: null }),
    )

    const dto = await getOrCreateCustomer({
      ...identity,
      givenName: null,
      familyName: null,
    })
    expect(dto.givenName).toBeNull()
    expect(dto.familyName).toBeNull()
  })
})

describe("updateCustomerProfile", () => {
  it("updates both name parts", async () => {
    vi.mocked(updateProfile).mockResolvedValue(
      row({ given_name: "Jan", family_name: "M" }),
    )

    const dto = await updateCustomerProfile("sub-1", {
      givenName: "Jan",
      familyName: "M",
      phone: null,
    })

    expect(dto.givenName).toBe("Jan")
    expect(dto.familyName).toBe("M")
    expect(updateProfile).toHaveBeenCalledWith("sub-1", "Jan", "M", null)
  })

  it("REFUSES a barred customer", async () => {
    vi.mocked(updateProfile).mockResolvedValue(row({ status: "barred" }))

    await expect(
      updateCustomerProfile("sub-1", { givenName: "x", familyName: "y", phone: null }),
    ).rejects.toBeInstanceOf(CustomerBarredError)
  })

  it("fails closed when there is no record", async () => {
    vi.mocked(updateProfile).mockResolvedValue(null)

    await expect(
      updateCustomerProfile("sub-1", { givenName: "x", familyName: "y", phone: null }),
    ).rejects.toBeInstanceOf(CustomerNotFoundError)
  })

  it("stores a trimmed phone", async () => {
    vi.mocked(updateProfile).mockResolvedValue(row({ phone: "0400 000 000" }))

    const dto = await updateCustomerProfile("sub-1", {
      givenName: "Jan",
      familyName: "M",
      phone: "  0400 000 000  ",
    })

    expect(dto.phone).toBe("0400 000 000")
    expect(updateProfile).toHaveBeenCalledWith("sub-1", "Jan", "M", "0400 000 000")
  })

  /** Mobile drops nulls (`explicitNulls = false`), so clearing travels as `""`. */
  it("treats an empty string as CLEARED, because a null never survives the mobile wire", async () => {
    vi.mocked(updateProfile).mockResolvedValue(row({ phone: null }))

    await updateCustomerProfile("sub-1", { givenName: "Jan", familyName: "M", phone: "   " })

    expect(updateProfile).toHaveBeenCalledWith("sub-1", "Jan", "M", null)
  })

  it("REFUSES a customer inside the closure grace window", async () => {
    vi.mocked(updateProfile).mockResolvedValue(row({ closure_state: "closing" }))

    await expect(
      updateCustomerProfile("sub-1", { givenName: "x", familyName: "y", phone: null }),
    ).rejects.toBeInstanceOf(CustomerClosingError)
  })
})

describe("the closure gate (034 FR-041)", () => {
  it("REFUSES a closing customer on the identity read", async () => {
    vi.mocked(upsertCustomer).mockResolvedValue(row({ closure_state: "closing" }))

    await expect(getOrCreateCustomer(identity)).rejects.toBeInstanceOf(CustomerClosingError)
  })

  /** Barred and closing both answer a uniform 403 but stay distinct in logs and the closure flow. */
  it("keeps barred and closing as distinct errors", async () => {
    vi.mocked(upsertCustomer).mockResolvedValue(row({ status: "barred" }))
    await expect(getOrCreateCustomer(identity)).rejects.toBeInstanceOf(CustomerBarredError)

    vi.mocked(upsertCustomer).mockResolvedValue(row({ closure_state: "closing" }))
    await expect(getOrCreateCustomer(identity)).rejects.not.toBeInstanceOf(CustomerBarredError)
  })
})
