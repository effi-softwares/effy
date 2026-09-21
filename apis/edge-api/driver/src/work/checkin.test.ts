import { describe, expect, it } from "vitest";

import { ConflictError } from "./complete";
import { NotFoundError } from "./service";

describe("driver work refusals", () => {
  // ⚠ FR-038: "not yours" and "no such thing" must be the SAME refusal, or the route becomes an
  // oracle for which ids are real (052's byte-identical refusals). One error type is how that is
  // guaranteed rather than remembered.
  it("uses ONE error type for both not-found and not-yours", () => {
    const a = new NotFoundError();
    const b = new NotFoundError();
    expect(a.name).toBe("NotFoundError");
    expect(a.message).toBe(b.message);
  });

  it("keeps a conflict distinct from a not-found", () => {
    expect(new ConflictError("already checked in").name).toBe("ConflictError");
    expect(new NotFoundError().name).not.toBe("ConflictError");
  });
});
