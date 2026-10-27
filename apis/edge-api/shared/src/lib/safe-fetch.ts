// Fetching a picture from a link someone typed into a spreadsheet (102). The link is untrusted: it may
// name a private address, the instance metadata service or the database. The address is checked in the
// connection's own DNS lookup, so a name cannot pass the check and then resolve somewhere else.

import { lookup as dnsLookup, type LookupAddress } from "node:dns";
import { request } from "node:https";
import { BlockList, isIP } from "node:net";

import { readImageDimensions } from "./image-dimensions";

export const SAFE_FETCH_MAX_BYTES = 10 * 1024 * 1024;
const TIMEOUT_MS = 15_000;
const MAX_REDIRECTS = 3;

/** Loopback, private, link-local (metadata), CGNAT, multicast, reserved, and their IPv6 counterparts. */
const BLOCKED = new BlockList();
for (const [net, bits] of [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16], ["172.16.0.0", 12],
  ["192.0.0.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15], ["224.0.0.0", 4], ["240.0.0.0", 4],
] as const) BLOCKED.addSubnet(net, bits, "ipv4");
// IPv4-mapped IPv6 (::ffff:a.b.c.d) is checked as its IPv4 address below: as a BlockList rule it matches all IPv4.
for (const [net, bits] of [["::", 128], ["::1", 128], ["fc00::", 7], ["fe80::", 10], ["ff00::", 8]] as const) {
  BLOCKED.addSubnet(net, bits, "ipv6");
}

export function isBlockedAddress(address: string): boolean {
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(address);
  if (mapped) return isBlockedAddress(mapped[1]!);
  const hex = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i.exec(address);
  if (hex) {
    const hi = parseInt(hex[1]!, 16);
    const lo = parseInt(hex[2]!, 16);
    return isBlockedAddress(`${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`);
  }
  const family = isIP(address);
  if (family === 0) return true;
  return BLOCKED.check(address, family === 4 ? "ipv4" : "ipv6");
}

export type SafeFetchRefusal =
  | "not_https"
  | "bad_link"
  | "private_address"
  | "too_many_redirects"
  | "http_error"
  | "too_large"
  | "timeout"
  | "not_a_picture"
  | "unreachable";

export class SafeFetchError extends Error {
  constructor(readonly reason: SafeFetchRefusal, message: string) {
    super(message);
    this.name = "SafeFetchError";
  }
}

export interface FetchedPicture {
  bytes: Buffer;
  contentType: "image/jpeg" | "image/png" | "image/webp";
  width: number;
  height: number;
}

type Lookup = typeof dnsLookup;

/** Resolves like `dns.lookup`, and refuses the connection when any address it would use is blocked. */
function guardedLookup(base: Lookup): Lookup {
  return ((hostname: string, options: unknown, callback: unknown) => {
    const cb = (typeof options === "function" ? options : callback) as (
      err: NodeJS.ErrnoException | null, address: string | LookupAddress[], family?: number,
    ) => void;
    const opts = (typeof options === "object" && options !== null ? options : {}) as { all?: boolean };
    base(hostname, { ...opts, all: true }, (err, addresses) => {
      if (err) return cb(err, "", 0);
      const list = addresses as LookupAddress[];
      if (list.length === 0 || list.some((a) => isBlockedAddress(a.address))) {
        return cb(Object.assign(new Error("private_address"), { code: "EPRIVATE" }), "", 0);
      }
      if (opts.all) return cb(null, list);
      return cb(null, list[0]!.address, list[0]!.family);
    });
  }) as Lookup;
}

function sniff(bytes: Buffer): FetchedPicture["contentType"] | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (bytes.length >= 12 && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  return null;
}

interface Once {
  status: number;
  location: string | null;
  bytes: Buffer | null;
}

function getOnce(url: URL, lookup: Lookup): Promise<Once> {
  return new Promise((resolve, reject) => {
    const req = request(
      url,
      { method: "GET", lookup: guardedLookup(lookup), timeout: TIMEOUT_MS, headers: { accept: "image/*", "user-agent": "Effy-import/1" } },
      (res) => {
        const status = res.statusCode ?? 0;
        if (status >= 300 && status < 400) {
          res.resume();
          return resolve({ status, location: typeof res.headers.location === "string" ? res.headers.location : null, bytes: null });
        }
        if (status !== 200) {
          res.resume();
          return resolve({ status, location: null, bytes: null });
        }
        const declared = Number(res.headers["content-length"] ?? "0");
        if (declared > SAFE_FETCH_MAX_BYTES) {
          req.destroy();
          return reject(new SafeFetchError("too_large", "the picture is larger than 10 MB"));
        }
        const chunks: Buffer[] = [];
        let size = 0;
        res.on("data", (c: Buffer) => {
          size += c.length;
          if (size > SAFE_FETCH_MAX_BYTES) {
            req.destroy(new SafeFetchError("too_large", "the picture is larger than 10 MB"));
            return;
          }
          chunks.push(c);
        });
        res.on("end", () => resolve({ status, location: null, bytes: Buffer.concat(chunks) }));
        res.on("error", reject);
      },
    );
    req.on("timeout", () => req.destroy(new SafeFetchError("timeout", "the link took too long to answer")));
    req.on("error", (err) => {
      if (err instanceof SafeFetchError) return reject(err);
      if ((err as NodeJS.ErrnoException).code === "EPRIVATE") return reject(new SafeFetchError("private_address", "the link points at a private address"));
      reject(new SafeFetchError("unreachable", "the link could not be reached"));
    });
    req.end();
  });
}

/** One picture from an https link: at most three redirects, 10 MB, 15 s a hop, and it must be JPEG, PNG or WebP. */
export async function fetchPicture(link: string, deps: { lookup?: Lookup } = {}): Promise<FetchedPicture> {
  const lookup = deps.lookup ?? dnsLookup;
  let url: URL;
  try {
    url = new URL(link.trim());
  } catch {
    throw new SafeFetchError("bad_link", "this is not a link");
  }
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    if (url.protocol !== "https:") throw new SafeFetchError("not_https", "only https links are fetched");
    if (url.username || url.password) throw new SafeFetchError("bad_link", "a link with a password is not fetched");
    // A literal address skips DNS, so it is checked here.
    const host = url.hostname.replace(/^\[|\]$/g, "");
    if (isIP(host) !== 0 && isBlockedAddress(host)) throw new SafeFetchError("private_address", "the link points at a private address");

    const r = await getOnce(url, lookup);
    if (r.status >= 300 && r.status < 400) {
      if (!r.location) throw new SafeFetchError("http_error", "the link redirects nowhere");
      url = new URL(r.location, url);
      continue;
    }
    if (r.status !== 200 || !r.bytes) throw new SafeFetchError("http_error", `the link answered ${r.status}`);
    const contentType = sniff(r.bytes);
    let dims: { width: number; height: number } | null = null;
    try {
      dims = contentType ? readImageDimensions(r.bytes) : null;
    } catch {
      dims = null;
    }
    if (!contentType || !dims) throw new SafeFetchError("not_a_picture", "the link is not a JPEG, PNG or WebP picture");
    return { bytes: r.bytes, contentType, width: dims.width, height: dims.height };
  }
  throw new SafeFetchError("too_many_redirects", "the link redirects too many times");
}
