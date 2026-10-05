import { describe, expect, it } from "vitest";

import {
  channelPrefix,
  EPOCH_SECONDS,
  epochOf,
  parseChannel,
  publishEpochs,
  subscribableEpochs,
} from "./channel";

const at = (epoch: number, secondsIn: number) => (epoch * EPOCH_SECONDS + secondsIn) * 1000;

describe("epochs", () => {
  it("an epoch is ten minutes", () => {
    expect(epochOf(at(100, 0))).toBe(100);
    expect(epochOf(at(100, 599))).toBe(100);
    expect(epochOf(at(100, 600))).toBe(101);
  });

  it("publishes to the previous epoch too for the first minute", () => {
    expect(publishEpochs(at(100, 0))).toEqual([100, 99]);
    expect(publishEpochs(at(100, 59))).toEqual([100, 99]);
    expect(publishEpochs(at(100, 60))).toEqual([100]);
    expect(publishEpochs(at(100, 599))).toEqual([100]);
  });

  it("a subscription may name this epoch or the next, nothing else", () => {
    expect(subscribableEpochs(at(100, 300))).toEqual([100, 101]);
  });
});

describe("channelPrefix", () => {
  it("builds a scope's prefix", () => {
    expect(channelPrefix("shop", "7f3c2a10-0000-4000-8000-000000000001")).toBe(
      "/shop/7f3c2a10-0000-4000-8000-000000000001",
    );
  });

  it.each(["", "a/b", "*", "has space", "-leading", "x".repeat(51)])(
    "refuses %j as a scope id",
    (id) => {
      expect(() => channelPrefix("shop", id)).toThrow();
    },
  );
});

describe("parseChannel", () => {
  it("reads a well-formed channel", () => {
    expect(parseChannel("/driver/abc-123/2932000")).toEqual({
      namespace: "driver",
      scopeId: "abc-123",
      epoch: 2932000,
    });
  });

  it.each([
    "/shop/abc/*",
    "/shop/*/2932000",
    "/shop/*",
    "/*",
    "/shop/abc",
    "/shop/abc/2932000/extra",
    "/shop/abc/2932000/",
    "shop/abc/2932000",
    "/shop//2932000",
    "/shop/abc/12x",
    "/shop/abc/-1",
    "/other/abc/2932000",
    "/default/abc/2932000",
    "",
  ])("refuses %j", (path) => {
    expect(parseChannel(path)).toBeNull();
  });
});
