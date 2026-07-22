import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../customer/repo");
vi.mock("./repo");

import { CustomerBarredError, CustomerNotFoundError } from "../customer/service";
import { findByCognitoSub } from "../customer/repo";
import type { AddressRow } from "./model";
import { create, listByCustomer, remove, update } from "./repo";
import {
  AddressNotFoundError,
  AddressValidationError,
  createAddress,
  deleteAddress,
  DefaultDeleteBlockedError,
  listAddresses,
  updateAddress,
} from "./service";

const SUB = "sub-123";
const CID = "customer-1";

function customerRow(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: CID,
    cognito_sub: SUB,
    email: "shopper@example.com",
    given_name: null,
    family_name: null,
    status: "active",
    has_password: false,
    password_updated_at: null,
    created_at: new Date("2026-01-01"),
    updated_at: new Date("2026-01-01"),
    ...over,
  } as never;
}

function addressRow(over: Partial<AddressRow> = {}): AddressRow {
  return {
    id: "addr-1",
    label: "Home",
    recipient_name: "Janith",
    phone: null,
    line1: "1 Test St",
    line2: null,
    city: "Melbourne",
    region: "VIC",
    postal_code: "3000",
    country: "AU",
    is_default: true,
    ...over,
  };
}

const validInput = {
  label: "Home",
  recipientName: "Janith",
  phone: null,
  line1: "1 Test St",
  line2: null,
  city: "Melbourne",
  region: "VIC",
  postalCode: "3000",
  country: null,
  makeDefault: false,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(findByCognitoSub).mockResolvedValue(customerRow());
});

describe("addresses service — the access decision (FR-020, SC-005)", () => {
  it("refuses a caller with no record (never did GET /me) → CustomerNotFoundError", async () => {
    vi.mocked(findByCognitoSub).mockResolvedValue(null);
    await expect(listAddresses(SUB)).rejects.toBeInstanceOf(CustomerNotFoundError);
    expect(listByCustomer).not.toHaveBeenCalled();
  });

  it("refuses a barred customer holding a valid token → CustomerBarredError", async () => {
    vi.mocked(findByCognitoSub).mockResolvedValue(customerRow({ status: "barred" }));
    await expect(listAddresses(SUB)).rejects.toBeInstanceOf(CustomerBarredError);
    expect(listByCustomer).not.toHaveBeenCalled();
  });

  it("scopes the list query to the resolved INTERNAL customer id, not the sub", async () => {
    vi.mocked(listByCustomer).mockResolvedValue([addressRow()]);
    const out = await listAddresses(SUB);
    expect(listByCustomer).toHaveBeenCalledWith(CID);
    expect(out[0]).toMatchObject({ id: "addr-1", recipientName: "Janith", isDefault: true });
  });
});

describe("createAddress", () => {
  it("rejects missing required fields before touching the DB", async () => {
    await expect(
      createAddress(SUB, { ...validInput, line1: null }),
    ).rejects.toBeInstanceOf(AddressValidationError);
    expect(create).not.toHaveBeenCalled();
  });

  it("creates and returns the DTO for a valid payload", async () => {
    vi.mocked(create).mockResolvedValue(addressRow({ id: "addr-new" }));
    const out = await createAddress(SUB, validInput);
    expect(create).toHaveBeenCalledWith(CID, validInput);
    expect(out.id).toBe("addr-new");
  });
});

describe("updateAddress", () => {
  it("maps a null row (not owned / not found) to AddressNotFoundError", async () => {
    vi.mocked(update).mockResolvedValue(null);
    await expect(updateAddress(SUB, "nope", validInput)).rejects.toBeInstanceOf(AddressNotFoundError);
  });

  it("returns the updated DTO", async () => {
    vi.mocked(update).mockResolvedValue(addressRow({ label: "Work" }));
    const out = await updateAddress(SUB, "addr-1", validInput);
    expect(out.label).toBe("Work");
  });
});

describe("deleteAddress — the delete-default guard (FR-016a, SC-010)", () => {
  it("not_found → AddressNotFoundError", async () => {
    vi.mocked(remove).mockResolvedValue("not_found");
    await expect(deleteAddress(SUB, "x")).rejects.toBeInstanceOf(AddressNotFoundError);
  });

  it("default_blocked → DefaultDeleteBlockedError (the 409)", async () => {
    vi.mocked(remove).mockResolvedValue("default_blocked");
    await expect(deleteAddress(SUB, "x")).rejects.toBeInstanceOf(DefaultDeleteBlockedError);
  });

  it("deleted → resolves", async () => {
    vi.mocked(remove).mockResolvedValue("deleted");
    await expect(deleteAddress(SUB, "x")).resolves.toBeUndefined();
  });
});
