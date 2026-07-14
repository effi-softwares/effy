import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("./repo", () => ({
  upsertCustomer: vi.fn(),
  updateDisplayName: vi.fn(),
}))

import { upsertCustomer, updateDisplayName } from "./repo"
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
  display_name: "Janith",
  status: "active",
  created_at: new Date("2026-07-14T00:00:00Z"),
  updated_at: new Date("2026-07-14T00:00:00Z"),
  ...over,
})

const identity = { sub: "sub-1", email: "shopper@example.com", name: "Janith" }

beforeEach(() => vi.clearAllMocks())

describe("getOrCreateCustomer", () => {
  it("returns the PLATFORM RECORD, not the token's claims", async () => {
    // The record says "Janith" and active; whatever the token claims is irrelevant.
    vi.mocked(upsertCustomer).mockResolvedValue(row())

    const dto = await getOrCreateCustomer(identity)

    expect(dto).toEqual({
      id: "c-1",
      email: "shopper@example.com",
      displayName: "Janith",
      status: "active",
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
      displayName: "Janith",
    })
  })

  it("tolerates a customer with no name (the OTP route never asks for one)", async () => {
    vi.mocked(upsertCustomer).mockResolvedValue(row({ display_name: null }))

    const dto = await getOrCreateCustomer({ ...identity, name: null })
    expect(dto.displayName).toBeNull()
  })
})

describe("updateCustomerProfile", () => {
  it("updates the display name", async () => {
    vi.mocked(updateDisplayName).mockResolvedValue(row({ display_name: "Janith M" }))

    const dto = await updateCustomerProfile("sub-1", { displayName: "Janith M" })

    expect(dto.displayName).toBe("Janith M")
    expect(updateDisplayName).toHaveBeenCalledWith("sub-1", "Janith M")
  })

  it("REFUSES a barred customer", async () => {
    vi.mocked(updateDisplayName).mockResolvedValue(row({ status: "barred" }))

    await expect(
      updateCustomerProfile("sub-1", { displayName: "x" }),
    ).rejects.toBeInstanceOf(CustomerBarredError)
  })

  it("fails closed when there is no record", async () => {
    vi.mocked(updateDisplayName).mockResolvedValue(null)

    await expect(
      updateCustomerProfile("sub-1", { displayName: "x" }),
    ).rejects.toBeInstanceOf(CustomerNotFoundError)
  })
})
