// `range.<key>=<min>..<max>`: a number attribute filtered by range, in the unit its facet showed (the
// attribute's first unit). Converted to the family's base unit before it reaches SQL, so 1.5 kg and 1500 g
// compare equal (101).
import { isUnitFamily, toBase, type UnitFamily } from "@effy/shared-types";

import type { AttributeRange } from "./filters";

/** As sent: either bound may be empty ("10.." or "..20"). */
export interface RawRange {
  min: string;
  max: string;
}

export interface RangeUnit {
  unitFamily: UnitFamily | null;
  /** The attribute's first unit: the one its facet shows. */
  unit: string | null;
}

export type RangeUnitLookup = (keys: readonly string[]) => Promise<Map<string, RangeUnit>>;

const DECIMAL = /^-?\d+(\.\d+)?$/;
const KEY = /^[a-z0-9]+(_[a-z0-9]+)*$/;

/** Every `range.<key>` parameter that parses; null when there are none. A malformed one is null too (400). */
export function rangeParams(q: URLSearchParams): Record<string, RawRange> | null | "invalid" {
  const out: Record<string, RawRange> = {};
  for (const name of new Set(q.keys())) {
    if (!name.startsWith("range.")) continue;
    const key = name.slice("range.".length);
    const raw = (q.get(name) ?? "").trim();
    const m = /^(.*)\.\.(.*)$/.exec(raw);
    if (!KEY.test(key) || !m) return "invalid";
    const [min, max] = [m[1]!.trim(), m[2]!.trim()];
    if ((min !== "" && !DECIMAL.test(min)) || (max !== "" && !DECIMAL.test(max)) || (min === "" && max === "")) return "invalid";
    out[key] = { min, max };
  }
  return Object.keys(out).length > 0 ? out : null;
}

/** Bounds in base units; a key that is not a filterable number attribute is dropped (it filters nothing). */
export async function toBaseRanges(raw: Readonly<Record<string, RawRange>>, lookup: RangeUnitLookup): Promise<Record<string, AttributeRange>> {
  const keys = Object.keys(raw);
  if (keys.length === 0) return {};
  const units = await lookup(keys);
  const out: Record<string, AttributeRange> = {};
  for (const key of keys) {
    const u = units.get(key);
    if (!u) continue;
    const convert = (v: string) => {
      if (v === "") return null;
      const n = Number(v);
      return u.unitFamily && isUnitFamily(u.unitFamily) && u.unit ? toBase(n, u.unitFamily, u.unit) : n;
    };
    out[key] = { min: convert(raw[key]!.min), max: convert(raw[key]!.max) };
  }
  return out;
}
