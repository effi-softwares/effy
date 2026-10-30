import { describe, expect, it } from "vitest";

import {
  DimensionsBeyondBufferError,
  UnsupportedImageError,
  isDimensionsBeyondBuffer,
  readImageDimensions,
} from "./image-dimensions";

/** Fixtures are built byte by byte. Two WebP sub-formats are 1-based, and a JPEG sof past the prefix must be retried, not rejected. */

function png(width: number, height: number): Buffer {
  const b = Buffer.alloc(24);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b, 0);
  b.write("IHDR", 12, "ascii");
  b.writeUInt32BE(width, 16);
  b.writeUInt32BE(height, 20);
  return b;
}

/** `padBytes` of filler segments before the SOF, standing in for exif or a thumbnail. */
function jpeg(width: number, height: number, padBytes = 0): Buffer {
  const parts: Buffer[] = [Buffer.from([0xff, 0xd8])];

  if (padBytes > 0) {
    const segment = Buffer.alloc(padBytes + 4);
    segment.writeUInt8(0xff, 0);
    segment.writeUInt8(0xe1, 1); // APP1 - where exif actually lives
    segment.writeUInt16BE(padBytes + 2, 2);
    parts.push(segment);
  }

  const sof = Buffer.alloc(11);
  sof.writeUInt8(0xff, 0);
  sof.writeUInt8(0xc0, 1); // SOF0
  sof.writeUInt16BE(9, 2); // segment length
  sof.writeUInt8(8, 4); // precision
  sof.writeUInt16BE(height, 5);
  sof.writeUInt16BE(width, 7);
  parts.push(sof);

  return Buffer.concat(parts);
}

function webpLossy(width: number, height: number): Buffer {
  const b = Buffer.alloc(30);
  b.write("RIFF", 0, "ascii");
  b.write("WEBP", 8, "ascii");
  b.write("VP8 ", 12, "ascii");
  b.writeUInt16LE(width, 26);
  b.writeUInt16LE(height, 28);
  return b;
}

function webpLossless(width: number, height: number): Buffer {
  const b = Buffer.alloc(25);
  b.write("RIFF", 0, "ascii");
  b.write("WEBP", 8, "ascii");
  b.write("VP8L", 12, "ascii");
  // 1-based and bit-packed: 14 bits of (width-1), then 14 bits of (height-1).
  b.writeUInt32LE(((height - 1) << 14) | (width - 1), 21);
  return b;
}

function webpExtended(width: number, height: number): Buffer {
  const b = Buffer.alloc(30);
  b.write("RIFF", 0, "ascii");
  b.write("WEBP", 8, "ascii");
  b.write("VP8X", 12, "ascii");
  b.writeUIntLE(width - 1, 24, 3);
  b.writeUIntLE(height - 1, 27, 3);
  return b;
}

describe("readImageDimensions", () => {
  it("reads a PNG", () => {
    expect(readImageDimensions(png(1200, 600))).toEqual({ width: 1200, height: 600, format: "png" });
  });

  it("reads a JPEG", () => {
    expect(readImageDimensions(jpeg(1200, 600))).toEqual({ width: 1200, height: 600, format: "jpeg" });
  });

  it("walks past EXIF-sized padding to find the JPEG SOF", () => {
    // The usual photo: the dimensions are nowhere near the start.
    expect(readImageDimensions(jpeg(1200, 600, 4000))).toEqual({
      width: 1200,
      height: 600,
      format: "jpeg",
    });
  });

  it("reads a lossy WebP (VP8 )", () => {
    expect(readImageDimensions(webpLossy(1200, 600))).toEqual({ width: 1200, height: 600, format: "webp" });
  });

  it("reads a lossless WebP (VP8L) - bit-packed and 1-based", () => {
    // Off-by-one would give 1199×599.
    expect(readImageDimensions(webpLossless(1200, 600))).toEqual({
      width: 1200,
      height: 600,
      format: "webp",
    });
  });

  it("reads an extended WebP (VP8X) - 24-bit and 1-based", () => {
    expect(readImageDimensions(webpExtended(1200, 600))).toEqual({
      width: 1200,
      height: 600,
      format: "webp",
    });
  });

  it("distinguishes 'need more bytes' from 'not an image'", () => {
    // A JPEG whose SOF is past the fetched prefix is fine: the caller retries with a larger range.
    const truncated = jpeg(1200, 600, 4000).subarray(0, 500);

    expect(() => readImageDimensions(truncated)).toThrow(DimensionsBeyondBufferError);
    try {
      readImageDimensions(truncated);
    } catch (e) {
      expect(isDimensionsBeyondBuffer(e)).toBe(true);
    }
  });

  it("rejects a non-image", () => {
    expect(() => readImageDimensions(Buffer.from("this is plainly not an image at all"))).toThrow(
      UnsupportedImageError,
    );
  });

  it("reads a MINIMAL jpeg - the smallest valid one, with no padding at all", () => {
    // A 13-byte valid file must be read: formats identify at very different lengths (JPEG 2, WebP 12).
    const minimal = jpeg(1200, 600);
    expect(minimal.length).toBeLessThan(16);
    expect(readImageDimensions(minimal)).toEqual({ width: 1200, height: 600, format: "jpeg" });
  });

  it("rejects a buffer too short to identify", () => {
    expect(() => readImageDimensions(Buffer.alloc(4))).toThrow(UnsupportedImageError);
  });

  it("rejects an unrecognised WebP chunk rather than guessing", () => {
    const b = webpLossy(1200, 600);
    b.write("VP9!", 12, "ascii");
    expect(() => readImageDimensions(b)).toThrow(UnsupportedImageError);
  });
});
