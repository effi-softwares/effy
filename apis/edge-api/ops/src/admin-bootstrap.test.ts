import { describe, expect, it } from "vitest";

import type { Transactor } from "@effy/edge-shared";
import type { SignInPort } from "@effy/edge-shared/team";

import { createFirstAdmin, deleteAdmin, validateInput } from "./admin-bootstrap";

// The flows themselves run against the real schema in ops.container.test.ts (the writer is SQL).
function untouched() {
  const touched: string[] = [];
  const port = new Proxy({}, { get: (_t, name) => async () => touched.push(`port.${String(name)}`) }) as unknown as SignInPort;
  const transact: Transactor = async () => {
    touched.push("db");
    throw new Error("no database in a unit test");
  };
  return { port, transact, touched };
}

describe("the break-glass tool validates before any side effect", () => {
  it("refuses the forms an email argument must never take", () => {
    for (const bad of ["", "jane", "jane@", "@effy.test", "Jane <jane@effy.test>", "a@b.c, d@e.f", "jane @effy.test", " jane@effy.test"]) {
      expect(() => validateInput(bad, "Jane"), bad).toThrow(/invalid email/);
    }
    expect(() => validateInput("jane.doe+ops@effy.test", "Jane")).not.toThrow();
    expect(() => validateInput("contractor@gmail.com", "Jane")).not.toThrow();
  });

  it("create: a bad email or an empty name touches nothing", async () => {
    const f = untouched();
    await expect(createFirstAdmin(f.port, f.transact, "not-an-email", "Jane")).rejects.toThrow(/invalid email/);
    await expect(createFirstAdmin(f.port, f.transact, "jane@effy.test", "   ")).rejects.toThrow(/name is required/);
    expect(f.touched).toEqual([]);
  });

  it("delete: a bad email touches nothing", async () => {
    const f = untouched();
    await expect(deleteAdmin(f.port, f.transact, "nope", false)).rejects.toThrow(/invalid email/);
    expect(f.touched).toEqual([]);
  });
});
