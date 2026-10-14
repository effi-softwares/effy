import { ListObjectsV2Command } from "@aws-sdk/client-s3";
import { SendMessageBatchCommand } from "@aws-sdk/client-sqs";
import { describe, expect, it } from "vitest";

import { keysOf } from "./render";
import { backfill } from "./rendition-backfill";

describe("keysOf — reading the bucket's notification", () => {
  it("decodes the keys S3 sends (+ is a space)", () => {
    const body = JSON.stringify({ Records: [{ s3: { object: { key: "products/o/a+b%2Bc.jpg" } } }, { s3: { object: { key: "promotions/p/x.png" } } }] });
    expect(keysOf(body)).toEqual(["products/o/a b+c.jpg", "promotions/p/x.png"]);
  });
  it("S3's test message names nothing", () => {
    expect(keysOf(JSON.stringify({ Service: "Amazon S3", Event: "s3:TestEvent" }))).toEqual([]);
  });
});

describe("backfill (086 FR-011)", () => {
  function harness(pages: Record<string, string[][]>, known: { ready?: string[]; failed?: string[] } = {}) {
    const sent: string[][] = [];
    const s3 = {
      send: async (cmd: ListObjectsV2Command) => {
        const list = pages[cmd.input.Prefix!] ?? [[]];
        const i = cmd.input.ContinuationToken ? Number(cmd.input.ContinuationToken) : 0;
        return { Contents: (list[i] ?? []).map((Key) => ({ Key })), IsTruncated: i + 1 < list.length, NextContinuationToken: String(i + 1) };
      },
    };
    const sqs = {
      send: async (cmd: SendMessageBatchCommand) => {
        sent.push(cmd.input.Entries!.map((e) => keyOfBody(e.MessageBody!)));
        return { Failed: [] };
      },
    };
    const repo = { knownKeys: async () => ({ ready: new Set(known.ready ?? []), failed: new Set(known.failed ?? []) }) };
    return { deps: { s3: s3 as never, sqs: sqs as never, bucket: "b", queueUrl: "q", repo }, sent };
  }
  const keyOfBody = (b: string) => keysOf(b)[0]!;

  it("queues what has no copies, skips what has, across pages, in batches of ten", async () => {
    const products = Array.from({ length: 23 }, (_, i) => `products/o/${i}.jpg`);
    const h = harness({ "products/": [products.slice(0, 12), [...products.slice(12), "products/o/notes.txt"]], "promotions/": [["promotions/p/a.png"]] }, { ready: ["products/o/0.jpg"] });
    expect(await backfill({}, h.deps)).toEqual({ listed: 24, alreadyReady: 1, skippedFailed: 0, queued: 23 });
    expect(h.sent.every((b) => b.length <= 10)).toBe(true);
    expect(h.sent.flat()).toContain("promotions/p/a.png");
    expect(h.sent.flat()).not.toContain("products/o/0.jpg");
  });

  it("leaves failed pictures alone unless asked to retry them", async () => {
    const h = harness({ "products/": [["products/o/bad.jpg"]] }, { failed: ["products/o/bad.jpg"] });
    expect((await backfill({ prefix: "products/" }, h.deps)).skippedFailed).toBe(1);
    const again = harness({ "products/": [["products/o/bad.jpg"]] }, { failed: ["products/o/bad.jpg"] });
    expect((await backfill({ prefix: "products/", retryFailed: true }, again.deps)).queued).toBe(1);
  });

  it("refuses a prefix that is not an original prefix", async () => {
    await expect(backfill({ prefix: "proof/" }, harness({}).deps)).rejects.toThrow(/prefix must be one of/);
  });

  it("a re-run after everything is ready queues nothing", async () => {
    const h = harness({ "products/": [["products/o/a.jpg"]], "promotions/": [[]] }, { ready: ["products/o/a.jpg"] });
    expect((await backfill({}, h.deps)).queued).toBe(0);
  });
});
