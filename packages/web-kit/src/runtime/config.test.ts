import { describe, expect, it } from "vitest";

import { createConfig } from "./config";

const REQUIRED = ["VITE_COGNITO_USER_POOL_ID", "VITE_COGNITO_CLIENT_ID", "VITE_API_BASE_URL"] as const;

describe("createConfig", () => {
  it("passes when every required key is present", () => {
    const config = createConfig(REQUIRED, {
      VITE_COGNITO_USER_POOL_ID: "pool",
      VITE_COGNITO_CLIENT_ID: "client",
      VITE_API_BASE_URL: "https://api.test",
    });
    expect(() => config.assert()).not.toThrow();
    expect(config.require("VITE_API_BASE_URL")).toBe("https://api.test");
  });

  // Fail loud, and name every missing key at once — a console that boots half-configured points at
  // the wrong pool and then blames the backend (contracts/config.contract.md).
  it("names every missing key in one throw", () => {
    const config = createConfig(REQUIRED, { VITE_COGNITO_CLIENT_ID: "client" });
    expect(() => config.assert()).toThrow(/VITE_COGNITO_USER_POOL_ID.*VITE_API_BASE_URL/s);
  });

  it("treats an empty string as missing", () => {
    const config = createConfig(REQUIRED, {
      VITE_COGNITO_USER_POOL_ID: "",
      VITE_COGNITO_CLIENT_ID: "client",
      VITE_API_BASE_URL: "https://api.test",
    });
    expect(() => config.assert()).toThrow(/VITE_COGNITO_USER_POOL_ID/);
  });

  it("returns undefined for an absent optional key rather than throwing", () => {
    const config = createConfig(REQUIRED, {});
    expect(config.optional("VITE_POSTHOG_KEY")).toBeUndefined();
  });
});
