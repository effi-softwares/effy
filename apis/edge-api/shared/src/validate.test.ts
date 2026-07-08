import { describe, expect, it } from "vitest";

import { optionalPositiveInt, parseJsonBody, requireNonEmptyString } from "./validate";

describe("parseJsonBody", () => {
  it("parses a JSON object", () => {
    const v = parseJsonBody<{ name: string }>('{"name":"x"}');
    expect(v.errors).toHaveLength(0);
    expect(v.value).toEqual({ name: "x" });
  });

  it.each([
    ["absent body", undefined],
    ["invalid JSON", "{nope"],
    ["non-object", '"just a string"'],
    ["array", "[1,2]"],
  ])("%s is a typed field error, never a crash", (_name, body) => {
    const v = parseJsonBody(body);
    expect(v.value).toBeUndefined();
    expect(v.errors[0]?.field).toBe("body");
  });
});

describe("field validators", () => {
  it("requireNonEmptyString flags missing/blank values", () => {
    expect(requireNonEmptyString({ name: "ok" }, "name")).toBeUndefined();
    expect(requireNonEmptyString({}, "name")?.field).toBe("name");
    expect(requireNonEmptyString({ name: "   " }, "name")?.field).toBe("name");
  });

  it("optionalPositiveInt accepts absence, rejects junk", () => {
    expect(optionalPositiveInt({}, "limit")).toBeUndefined();
    expect(optionalPositiveInt({ limit: 20 }, "limit")).toBeUndefined();
    expect(optionalPositiveInt({ limit: -1 }, "limit")?.field).toBe("limit");
    expect(optionalPositiveInt({ limit: "20" }, "limit")?.field).toBe("limit");
  });
});
