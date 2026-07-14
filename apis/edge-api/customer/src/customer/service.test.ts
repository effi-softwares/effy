import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("./repo", () => ({
  upsertCustomer: vi.fn(),
  updateName: vi.fn(),
}))

import { upsertCustomer, updateName } from "./repo"
import {
  CustomerBarredError,
  CustomerNotFoundError,
  getOrCreateCustomer,
  updateCustomerProfile,
} from "./service"

import type { CustomerRow } from "./model"

const row = (over: Partial<CustomerRow> = {}): CustomerRow => ({
  id: "c-1",
  cognito_sub: "sub-1",
  email: "shopper@example.com",
  given_name: "Janith",
  family_name: "Madarasinghe",
  status: "active",
  // 012 — platform-owned password state. `false`/`null` is the ordinary case: an email-OTP customer
  // who has never had a password, which is a complete and permanent state, not a gap.
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
    // The record says "Janith" and active; whatever the token claims is irrelevant.
    vi.mocked(upsertCustomer).mockResolvedValue(row())

    const dto = await getOrCreateCustomer(identity)

    expect(dto).toEqual({
      id: "c-1",
      email: "shopper@example.com",
      givenName: "Janith",
      familyName: "Madarasinghe",
      status: "active",
      hasPassword: false,
      passwordUpdatedAt: null,
      createdAt: "2026-07-14T00:00:00.000Z",
    })
  })

  it("never leaks cognito_sub over the wire", async () => {
    vi.mocked(upsertCustomer).mockResolvedValue(row())
    const dto = await getOrCreateCustomer(identity)
    expect(dto).not.toHaveProperty("cognito_sub")
  })

  /**
   * FR-025 / SC-011 — the whole reason the platform keeps its own record.
   *
   * The gateway already proved the token is genuine, unexpired and minted by the customer pool.
   * If that were sufficient, Effy could never ban anybody.
   */
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

  it("tolerates a customer with no name — a FEDERATED identity may supply neither", async () => {
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
    vi.mocked(updateName).mockResolvedValue(
      row({ given_name: "Jan", family_name: "M" }),
    )

    const dto = await updateCustomerProfile("sub-1", {
      givenName: "Jan",
      familyName: "M",
    })

    expect(dto.givenName).toBe("Jan")
    expect(dto.familyName).toBe("M")
    expect(updateName).toHaveBeenCalledWith("sub-1", "Jan", "M")
  })

  it("REFUSES a barred customer", async () => {
    vi.mocked(updateName).mockResolvedValue(row({ status: "barred" }))

    await expect(
      updateCustomerProfile("sub-1", { givenName: "x", familyName: "y" }),
    ).rejects.toBeInstanceOf(CustomerBarredError)
  })

  it("fails closed when there is no record", async () => {
    vi.mocked(updateName).mockResolvedValue(null)

    await expect(
      updateCustomerProfile("sub-1", { givenName: "x", familyName: "y" }),
    ).rejects.toBeInstanceOf(CustomerNotFoundError)
  })
})
