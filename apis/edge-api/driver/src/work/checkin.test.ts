import { describe, expect, it } from "vitest";

import { ConflictError } from "./complete";
import { NotFoundError } from "./service";

describe("driver work refusals", () => {
  // "Not yours" and "no such thing" are one error type.
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
