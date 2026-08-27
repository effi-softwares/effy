import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { stageFor } from "./service";

/**
 * ⚠ THIS FILE EXISTS BECAUSE `stageFor` IS A SECOND IMPLEMENTATION OF A RULE, AND THAT IS A HAZARD.
 *
 * The authority is `apis/core-api/internal/features/orders/stage.go` — it computes the word the
 * CUSTOMER sees, and 052 deleted customer-web's `summarizeFulfillment` specifically to stop a second
 * implementation existing. The console needs the same word for a different reason: to show an
 * operator what the shopper is currently being told, so support does not reassure someone about a
 * status they cannot see.
 *
 * Calling `core-api` for it was rejected in research R1 (an operator console has no business on the
 * hot path, and it would import back-office concerns there). So the rule is mirrored — and mirrored
 * rules drift silently, because both sides keep returning *something*. 029's banner target and 033's
 * `available` flag are both this failure.
 *
 * The guard is therefore not "test the TypeScript". It is: READ THE GO SOURCE AND COMPARE. If
 * someone changes the rank map on either side without the other, this fails and names the mismatch.
 */

const here = dirname(fileURLToPath(import.meta.url));
const STAGE_GO = resolve(here, "../../../../core-api/internal/features/orders/stage.go");

/** The rank map as Go actually declares it, parsed from the source of truth. */
function goRankMap(): Record<string, number> {
  const src = readFileSync(STAGE_GO, "utf8");
  const block = /var rank = map\[string\]int\{([\s\S]*?)\}/.exec(src);
  if (!block) throw new Error(`could not find the rank map in ${STAGE_GO}`);
  const out: Record<string, number> = {};
  for (const line of block[1]!.split("\n")) {
    const m = /^\s*"([a-z_]+)":\s*(\d+),/.exec(line);
    if (m) out[m[1]!] = Number(m[2]);
  }
  return out;
}

/** The stage each rank maps to, per Go's own switch. */
const STAGE_BY_RANK = ["confirmed", "packing", "on_the_way", "delivered"] as const;

describe("stageFor mirrors core-api's stage.go", () => {
  const go = goRankMap();

  it("parsed a non-trivial map out of the Go source", () => {
    // Guards the guard: a regex that silently matches nothing would make every assertion below
    // vacuously true — 029's "the test was watching it happen" failure.
    expect(Object.keys(go).length).toBeGreaterThanOrEqual(6);
    expect(go).toHaveProperty("ready_for_pickup");
  });

  it("agrees with Go on EVERY status Go knows", () => {
    for (const [status, rank] of Object.entries(go)) {
      expect(stageFor([status]), `status "${status}" disagrees with stage.go`).toBe(
        STAGE_BY_RANK[rank],
      );
    }
  });

  it("holds 053's correction: ready_for_pickup is packing, not on the way", () => {
    // Pinned on BOTH sides. Go's own stage_test.go pins it there; this pins that the console agrees,
    // so an operator is never told the shopper sees "on the way" while they see "packing".
    expect(go["ready_for_pickup"]).toBe(1);
    expect(stageFor(["ready_for_pickup"])).toBe("packing");
    expect(stageFor(["collected"])).toBe("on_the_way");
  });
});

describe("stageFor", () => {
  it("is a rollup, not a max", () => {
    // The order is only as far along as its LEAST advanced package. A max would tell a shopper their
    // shopping is on the doorstep while half of it is still being picked.
    expect(stageFor(["delivered", "picking"])).toBe("packing");
    expect(stageFor(["delivered", "pending"])).toBe("confirmed");
    expect(stageFor(["delivered", "delivered"])).toBe("delivered");
  });

  it("treats an order with no packages as confirmed", () => {
    expect(stageFor([])).toBe("confirmed");
  });

  it("never lets an unknown status advance the order", () => {
    expect(stageFor(["teleported"])).toBe("confirmed");
    expect(stageFor(["delivered", "teleported"])).toBe("confirmed");
  });
});
