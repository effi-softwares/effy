import { describe, expect, it } from "vitest";

import { keysOf } from "./render";

describe("keysOf — reading the bucket's notification", () => {
  it("decodes the keys S3 sends (+ is a space)", () => {
    const body = JSON.stringify({ Records: [{ s3: { object: { key: "products/o/a+b%2Bc.jpg" } } }, { s3: { object: { key: "promotions/p/x.png" } } }] });
    expect(keysOf(body)).toEqual(["products/o/a b+c.jpg", "promotions/p/x.png"]);
  });
  it("S3's test message names nothing", () => {
    expect(keysOf(JSON.stringify({ Service: "Amazon S3", Event: "s3:TestEvent" }))).toEqual([]);
  });
});
