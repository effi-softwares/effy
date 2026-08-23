import { describe, expect, it, vi, beforeEach } from "vitest";

import * as cognito from "./cognito";
import * as repo from "./repository";
import { createDriver, DriverAdminError, setStatus } from "./service";

const ROW = {
  id: "d1",
  name: "Jomo Ondiek",
  workEmail: "jomo@effyshopping.com",
  zone: "Inner North",
  vehicle: { type: "Van", plate: "1QZ 4KP" },
  status: "active" as const,
};

describe("createDriver — Cognito-first → record, with validation", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("rejects a missing name before touching Cognito", async () => {
    const spy = vi.spyOn(cognito, "ensureDriverUser");
    await expect(createDriver({ name: "", workEmail: "a@b.co" })).rejects.toBeInstanceOf(DriverAdminError);
    expect(spy).not.toHaveBeenCalled();
  });

  it("rejects an invalid email before touching Cognito", async () => {
    const spy = vi.spyOn(cognito, "ensureDriverUser");
    await expect(createDriver({ name: "Jomo", workEmail: "not-an-email" })).rejects.toBeInstanceOf(DriverAdminError);
    expect(spy).not.toHaveBeenCalled();
  });

  it("provisions Cognito then upserts the record keyed on the returned sub", async () => {
    vi.spyOn(cognito, "ensureDriverUser").mockResolvedValue("sub-xyz");
    const upsert = vi.spyOn(repo, "upsertDriver").mockResolvedValue("d1");
    vi.spyOn(repo, "getDriver").mockResolvedValue(ROW);

    const out = await createDriver({ name: " Jomo Ondiek ", workEmail: "JOMO@Effyshopping.com" });

    // Email normalised to lower-case; sub from Cognito is the join key.
    expect(cognito.ensureDriverUser).toHaveBeenCalledWith("jomo@effyshopping.com", "Jomo Ondiek");
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ sub: "sub-xyz", workEmail: "jomo@effyshopping.com" }));
    expect(out).toEqual(ROW);
  });
});

describe("setStatus — mirrors record status onto the identity account", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("disables the Cognito user when disabling the record", async () => {
    vi.spyOn(repo, "setStatus").mockResolvedValue("jomo@effyshopping.com");
    const disable = vi.spyOn(cognito, "disableDriverUser").mockResolvedValue();
    vi.spyOn(repo, "getDriver").mockResolvedValue({ ...ROW, status: "disabled" });

    await setStatus("d1", "disabled");
    expect(disable).toHaveBeenCalledWith("jomo@effyshopping.com");
  });

  it("404s an unknown driver", async () => {
    vi.spyOn(repo, "setStatus").mockResolvedValue(null);
    await expect(setStatus("ghost", "active")).rejects.toMatchObject({ kind: "not_found" });
  });
});
