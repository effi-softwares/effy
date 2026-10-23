// An image's pixel dimensions from its header bytes, with no image library. Uploads are presigned PUTs
// Lambda never sees, so the verifying service reads a short prefix of the stored object. PNG and JPEG
// are simple; WebP is a riff container with three sub-formats encoding dimensions differently.

export interface ImageDimensions {
  width: number;
  height: number;
  format: "png" | "jpeg" | "webp";
}

/** Not a supported image at all, distinct from the wrong shape. */
export class UnsupportedImageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsupportedImageError";
  }
}

/** A valid image whose dimensions lie past the bytes supplied (a large exif block): fetch more and retry. */
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
  // Only enough to identify a format; each reader guards its own needs (JPEG identifies in 2 bytes, WebP 12).
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

/** Ihdr is always first: width and height at offsets 16 and 20. */
function readPng(buffer: Buffer): ImageDimensions {
  if (buffer.length < 24) throw new DimensionsBeyondBufferError("PNG header incomplete");
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20), format: "png" };
}

/** Walks the marker segments to the SOF, which exif, icc profiles and thumbnails can push 60 KB in; running out is retryable. */
function readJpeg(buffer: Buffer): ImageDimensions {
  let offset = 2;

  while (offset < buffer.length) {
    if (buffer[offset] !== 0xff) {
      throw new UnsupportedImageError("malformed JPEG: expected a marker");
    }
    const marker = buffer[offset + 1];
    if (marker === undefined) throw new DimensionsBeyondBufferError("JPEG truncated mid-marker");

    // SOF0–SOF15 carry the frame header; C4 (DHT), C8 (JPG) and CC (DAC) look like SOFs and are not.
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
 * WebP sub-formats:
 *  · `VP8 ` (lossy) 14-bit width/height at offset 26, little-endian
 *  · `VP8L` (lossless) 14-bit each, bit-packed across 4 bytes at offset 21, 1-based
 *  · `VP8X` (extended) 24-bit each at offset 24, little-endian, 1-based
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
