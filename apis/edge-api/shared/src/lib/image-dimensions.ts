// Read an image's pixel dimensions from its header bytes — no image library (029 research R3).
//
// ── WHY THIS EXISTS ─────────────────────────────────────────────────────────────────────────────
//
// Artwork reaches S3 through a PRESIGNED PUT, which Lambda never observes. So a client-side size check
// is a convention a determined caller simply skips, and "stored artwork must conform" would be a
// promise nothing keeps. The verifying service fetches a short prefix of the object and reads its
// header, which is enough to answer "what shape is this?".
//
// ── WHY NOT `sharp` ─────────────────────────────────────────────────────────────────────────────
//
// A native image binary in a Lambda is a large cost — cold starts, platform-specific builds, a third
// image dependency — for one small question. 024 made the same trade with its 25-line stdlib ICO
// writer. Every format below carries its dimensions within the first few dozen bytes.
//
// ⚠ THE THREE FORMATS ARE NOT EQUALLY SIMPLE. PNG and JPEG are; **WebP is a different container**
// (RIFF) with three sub-formats that each encode dimensions differently. The first draft of this
// feature's research assumed WebP would be "like the others" — it is not, and pretending otherwise
// would have produced a reader that silently mis-sized every WebP banner.

export interface ImageDimensions {
  width: number;
  height: number;
  format: "png" | "jpeg" | "webp";
}

/** Raised when a buffer is not a supported image at all — distinct from "the wrong shape". */
export class UnsupportedImageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsupportedImageError";
  }
}

/**
 * Raised when the buffer IS a supported image but its dimensions lie beyond the bytes supplied.
 *
 * ⚠ Kept separate from [UnsupportedImageError] on purpose. A JPEG with a large EXIF block or an
 * embedded thumbnail can push its SOF marker past a short prefix — that is a perfectly valid file, and
 * refusing it would blame an operator for artwork that is fine. The caller's correct response is to
 * fetch more bytes and try again, not to reject.
 */
export class DimensionsBeyondBufferError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DimensionsBeyondBufferError";
  }
}

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/**
 * Read dimensions from the leading bytes of an image.
 *
 * @throws {UnsupportedImageError} the bytes are not PNG, JPEG or WebP
 * @throws {DimensionsBeyondBufferError} it is a valid image, but more bytes are needed
 */
export function readImageDimensions(buffer: Buffer): ImageDimensions {
  // ⚠ Only enough to IDENTIFY a format — each reader then guards its own needs.
  //
  // This guard was originally 16 bytes, applied up front, which rejected a minimal 13-byte JPEG as
  // "not an image". The formats have wildly different header lengths (JPEG identifies in 2 bytes,
  // WebP needs 12), so one shared minimum is always wrong for something. The failure was silent in
  // the worst way: a valid file reported as unsupported rather than as needing more bytes.
  if (buffer.length < 4) {
    throw new UnsupportedImageError("buffer too short to identify an image");
  }
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(PNG_SIGNATURE)) return readPng(buffer);
  if (buffer[0] === 0xff && buffer[1] === 0xd8) return readJpeg(buffer);
  if (
    buffer.length >= 12 &&
    buffer.toString("ascii", 0, 4) === "RIFF" &&
    buffer.toString("ascii", 8, 12) === "WEBP"
  ) {
    return readWebp(buffer);
  }
  throw new UnsupportedImageError("not a PNG, JPEG or WebP image");
}

/** PNG: the IHDR chunk is always first, so width and height sit at fixed offsets 16 and 20. */
function readPng(buffer: Buffer): ImageDimensions {
  if (buffer.length < 24) throw new DimensionsBeyondBufferError("PNG header incomplete");
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20), format: "png" };
}

/**
 * JPEG: walk the marker segments to the Start-Of-Frame, which carries the dimensions.
 *
 * ⚠ The SOF is NOT at a fixed offset — EXIF, ICC profiles and embedded thumbnails all sit in front of
 * it, and a photo straight off a phone can easily carry 60 KB of them. Running out of buffer here is
 * an ordinary outcome, not a malformed file, which is why it throws the retryable error.
 */
function readJpeg(buffer: Buffer): ImageDimensions {
  let offset = 2; // past SOI

  while (offset < buffer.length) {
    if (buffer[offset] !== 0xff) {
      throw new UnsupportedImageError("malformed JPEG: expected a marker");
    }
    const marker = buffer[offset + 1];
    if (marker === undefined) throw new DimensionsBeyondBufferError("JPEG truncated mid-marker");

    // SOF0–SOF15 carry the frame header. C4 (DHT), C8 (JPG) and CC (DAC) look like SOFs and are not.
    const isSof = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isSof) {
      if (offset + 9 > buffer.length) throw new DimensionsBeyondBufferError("JPEG SOF beyond buffer");
      return { height: buffer.readUInt16BE(offset + 5), width: buffer.readUInt16BE(offset + 7), format: "jpeg" };
    }

    if (offset + 4 > buffer.length) throw new DimensionsBeyondBufferError("JPEG segment length beyond buffer");
    const segmentLength = buffer.readUInt16BE(offset + 2);
    if (segmentLength < 2) throw new UnsupportedImageError("malformed JPEG: bad segment length");
    offset += 2 + segmentLength;
  }

  throw new DimensionsBeyondBufferError("JPEG SOF marker not found in the supplied bytes");
}

/**
 * WebP: a RIFF container whose fourth chunk-type byte selects one of three encodings.
 *
 * ⚠ This is the part that is genuinely unlike PNG and JPEG:
 *   · **`VP8 `** (lossy)    — 14-bit width/height at offset 26, little-endian
 *   · **`VP8L`** (lossless) — 14-bit each, bit-packed across 4 bytes at offset 21, and **1-based**
 *   · **`VP8X`** (extended) — 24-bit each at offset 24, little-endian, and **1-based**
 *
 * Two of the three are off-by-one from the naive reading. Getting that wrong yields dimensions one
 * pixel short — which passes a "looks about right" eyeball and fails an exact-size check.
 */
function readWebp(buffer: Buffer): ImageDimensions {
  const chunk = buffer.toString("ascii", 12, 16);

  if (chunk === "VP8 ") {
    if (buffer.length < 30) throw new DimensionsBeyondBufferError("WebP (lossy) header incomplete");
    return {
      width: buffer.readUInt16LE(26) & 0x3fff,
      height: buffer.readUInt16LE(28) & 0x3fff,
      format: "webp",
    };
  }

  if (chunk === "VP8L") {
    if (buffer.length < 25) throw new DimensionsBeyondBufferError("WebP (lossless) header incomplete");
    const bits = buffer.readUInt32LE(21);
    return {
      width: (bits & 0x3fff) + 1,
      height: ((bits >> 14) & 0x3fff) + 1,
      format: "webp",
    };
  }

  if (chunk === "VP8X") {
    if (buffer.length < 30) throw new DimensionsBeyondBufferError("WebP (extended) header incomplete");
    return {
      width: buffer.readUIntLE(24, 3) + 1,
      height: buffer.readUIntLE(27, 3) + 1,
      format: "webp",
    };
  }

  throw new UnsupportedImageError(`unrecognised WebP chunk type '${chunk}'`);
}

export function isDimensionsBeyondBuffer(e: unknown): e is DimensionsBeyondBufferError {
  return e instanceof DimensionsBeyondBufferError;
}

export function isUnsupportedImage(e: unknown): e is UnsupportedImageError {
  return e instanceof UnsupportedImageError;
}
