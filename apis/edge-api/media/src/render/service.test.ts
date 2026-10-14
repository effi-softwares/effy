import { GetObjectCommand, NoSuchKey, PutObjectCommand } from "@aws-sdk/client-s3";
import sharp from "sharp";
import { describe, expect, it } from "vitest";

import type { RenditionFailure, RenditionRepository } from "./repository";
import { render } from "./service";

/** An in-memory bucket and a recording repository. */
function harness(objects: Record<string, Buffer>) {
  const written = new Map<string, { body: Buffer; type?: string }>();
  const rows: { key: string; status: "ready" | "failed"; widths?: readonly number[]; failure?: RenditionFailure; w?: number | null; h?: number | null }[] = [];
  const s3 = {
    send: async (cmd: unknown) => {
      if (cmd instanceof GetObjectCommand) {
        const body = objects[cmd.input.Key!];
        if (!body) throw new NoSuchKey({ message: "gone", $metadata: {} });
        return { Body: { transformToByteArray: async () => new Uint8Array(body) } };
      }
      if (cmd instanceof PutObjectCommand) {
        written.set(cmd.input.Key!, { body: cmd.input.Body as Buffer, type: cmd.input.ContentType });
        return {};
      }
      throw new Error("unexpected command");
    },
  };
  const repo: RenditionRepository = {
    recordReady: async (key, widths, w, h) => void rows.push({ key, status: "ready", widths, w, h }),
    recordFailed: async (key, failure, w, h) => void rows.push({ key, status: "failed", failure, w, h }),
    knownKeys: async () => ({ ready: new Set(), failed: new Set() }),
  };
  return { deps: { s3: s3 as never, bucket: "b", repo }, written, rows };
}

const image = (width: number, height: number, channels: 3 | 4 = 3) =>
  sharp({ create: { width, height, channels, background: channels === 4 ? { r: 0, g: 0, b: 0, alpha: 0.5 } : "#3366cc" } });

describe("render (086 contracts/rendition-worker.md)", () => {
  it("a 2000 px photo gets the four standard copies, as WebP, under renditions/", async () => {
    const h = harness({ "products/o/a.jpg": await image(2000, 1500).jpeg().toBuffer() });
    expect(await render("products/o/a.jpg", h.deps)).toEqual({ kind: "ready", widths: [160, 320, 640, 1280] });
    expect([...h.written.keys()]).toEqual([160, 320, 640, 1280].map((w) => `renditions/products/o/a/w${w}.webp`));
    const w320 = await sharp(h.written.get("renditions/products/o/a/w320.webp")!.body).metadata();
    expect([w320.format, w320.width, w320.height]).toEqual(["webp", 320, 240]);
    expect(h.written.get("renditions/products/o/a/w320.webp")!.type).toBe("image/webp");
    expect(h.rows).toEqual([{ key: "products/o/a.jpg", status: "ready", widths: [160, 320, 640, 1280], w: 2000, h: 1500 }]);
  });

  it("a 1000 px photo's largest copy is the photo's own width — never an enlarged 640", async () => {
    const h = harness({ "products/o/b.jpg": await image(1000, 1000).jpeg().toBuffer() });
    expect(await render("products/o/b.jpg", h.deps)).toEqual({ kind: "ready", widths: [160, 320, 640, 1000] });
  });

  it("a 500 px PNG with transparency keeps its alpha", async () => {
    const h = harness({ "promotions/p/c.png": await image(500, 250, 4).png().toBuffer() });
    expect(await render("promotions/p/c.png", h.deps)).toEqual({ kind: "ready", widths: [160, 320, 500] });
    expect((await sharp(h.written.get("renditions/promotions/p/c/w160.webp")!.body).metadata()).hasAlpha).toBe(true);
  });

  it("a 100 px picture gets one copy, at its own width", async () => {
    const h = harness({ "products/o/d.jpg": await image(100, 100).jpeg().toBuffer() });
    expect(await render("products/o/d.jpg", h.deps)).toEqual({ kind: "ready", widths: [100] });
  });

  it("an animated picture gets no copies — the original is served, uncut", async () => {
    const frames = await Promise.all([image(400, 400).png().toBuffer(), image(400, 400, 4).png().toBuffer()]);
    const animated = await sharp(frames, { join: { animated: true } }).webp().toBuffer();
    expect((await sharp(animated).metadata()).pages).toBe(2);
    const h = harness({ "products/o/e.webp": animated });
    expect(await render("products/o/e.webp", h.deps)).toEqual({ kind: "ready", widths: [] });
    expect(h.written.size).toBe(0);
  });

  it("garbage bytes are recorded as corrupt, not thrown", async () => {
    const h = harness({ "products/o/f.jpg": Buffer.from("not a picture at all") });
    expect(await render("products/o/f.jpg", h.deps)).toEqual({ kind: "failed", failure: "corrupt" });
    expect(h.rows[0]).toMatchObject({ status: "failed", failure: "corrupt" });
  });

  it("a format outside JPEG/PNG/WebP is unsupported", async () => {
    const h = harness({ "products/o/g.jpg": await image(300, 300).gif().toBuffer() });
    expect(await render("products/o/g.jpg", h.deps)).toEqual({ kind: "failed", failure: "unsupported" });
  });

  it.each(["courier-label/p/x.pdf", "proof/d/x.jpg", "renditions/products/o/a/w160.webp"])(
    "refuses %s — no read, no write, no row",
    async (key) => {
      const h = harness({ [key]: await image(400, 400).jpeg().toBuffer() });
      expect(await render(key, h.deps)).toEqual({ kind: "refused" });
      expect(h.written.size + h.rows.length).toBe(0);
    },
  );

  it("a picture deleted since its upload leaves no row", async () => {
    const h = harness({});
    expect(await render("products/o/gone.jpg", h.deps)).toEqual({ kind: "gone" });
    expect(h.rows).toEqual([]);
  });

  it("measures a sideways phone photo as it is seen (EXIF orientation)", async () => {
    const sideways = await image(800, 400).jpeg().withMetadata({ orientation: 6 }).toBuffer();
    const h = harness({ "products/o/h.jpg": sideways });
    expect(await render("products/o/h.jpg", h.deps)).toEqual({ kind: "ready", widths: [160, 320, 400] });
    const w160 = await sharp(h.written.get("renditions/products/o/h/w160.webp")!.body).metadata();
    expect([w160.width, w160.height]).toEqual([160, 320]);
    expect(h.rows[0]).toMatchObject({ w: 400, h: 800 });
  });

  it("a platform fault is thrown so the queue retries it", async () => {
    const h = harness({});
    const failing = { ...h.deps, s3: { send: async () => { throw Object.assign(new Error("throttled"), { name: "SlowDown" }); } } as never };
    await expect(render("products/o/a.jpg", failing)).rejects.toThrow("throttled");
  });
});
