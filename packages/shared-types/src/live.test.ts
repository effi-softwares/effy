import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { LIVE_KINDS, parseLiveUpdate } from "./live";

describe("parseLiveUpdate", () => {
  it("reads a known kind", () => {
    expect(parseLiveUpdate('{"k":"orders"}')).toBe("orders");
  });

  it.each(['{"k":"prices"}', "{}", "null", '"orders"', "not json", '{"k":7}'])(
    "ignores %s",
    (raw) => {
      expect(parseLiveUpdate(raw)).toBeNull();
    },
  );
});

// The mobile apps cannot import this file. Their copy of the list lives once, in mobile-kit, and
// this is what keeps it from drifting: a kind added here and not there turns this red.
describe("the Kotlin kind list", () => {
  const kotlin = resolve(__dirname, "../../mobile-kit/common/live/LiveKind.kt");

  it.runIf(existsSync(kotlin))("names exactly the kinds declared here", () => {
    const source = readFileSync(kotlin, "utf8");
    const wire = [...source.matchAll(/^\s*[A-Z_]+\("([a-z]+)"\)/gm)].map((m) => m[1]);
    expect(wire).toEqual([...LIVE_KINDS]);
  });
});
