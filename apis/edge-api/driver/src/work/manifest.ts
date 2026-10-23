// Pure. One builder for the shop pickup and the customer drop, so the two screens cannot drift.

import type { ClassSummary, ManifestLine, TemperatureClass } from "@effy/shared-types";

export interface ManifestRow {
  package_id: string;
  name: string;
  ordered_qty: number | string;
  /** Snapshotted at placement. */
  storage_class: string;
  /** Null when the line has no pick row. */
  gathered_qty: number | string | null;
}

/** The catalogue's `ambient` is the driver's "normal". */
export function toTemperatureClass(storageClass: string): TemperatureClass {
  return storageClass === "frozen" || storageClass === "chilled" ? storageClass : "normal";
}

const CLASS_ORDER: Record<TemperatureClass, number> = {
  frozen: 0,
  chilled: 1,
  normal: 2,
};

function toLine(row: ManifestRow): ManifestLine {
  const ordered = Number(row.ordered_qty);
  // No pick row means picking never started, so the order is shown; a row with zero means none supplied.
  const qty = row.gathered_qty === null ? ordered : Number(row.gathered_qty);
  return {
    name: row.name,
    qty,
    orderedQty: ordered,
    included: qty > 0,
    temperatureClass: toTemperatureClass(row.storage_class),
  };
}

function compareLines(a: ManifestLine, b: ManifestLine): number {
  return (
    CLASS_ORDER[a.temperatureClass] - CLASS_ORDER[b.temperatureClass] ||
    Number(b.included) - Number(a.included) ||
    a.name.localeCompare(b.name)
  );
}

export const EMPTY_SUMMARY: ClassSummary = { frozen: 0, chilled: 0, normal: 0 };

/** A line the shop did not supply is in no bucket. */
export function summarize(lines: readonly ManifestLine[]): ClassSummary {
  const s: ClassSummary = { ...EMPTY_SUMMARY };
  for (const l of lines) {
    if (!l.included) continue;
    if (l.temperatureClass === "frozen") s.frozen += l.qty;
    else if (l.temperatureClass === "chilled") s.chilled += l.qty;
    else s.normal += l.qty;
  }
  return s;
}

export function addSummaries(summaries: readonly ClassSummary[]): ClassSummary {
  const s: ClassSummary = { ...EMPTY_SUMMARY };
  for (const x of summaries) {
    s.frozen += x.frozen;
    s.chilled += x.chilled;
    s.normal += x.normal;
  }
  return s;
}

export interface PackageManifest {
  items: ManifestLine[];
  summary: ClassSummary;
}

/** Keyed by package; a package with no rows gets an empty manifest, never an absent one. */
export function manifestsByPackage(
  packageIds: readonly string[],
  rows: readonly ManifestRow[],
): Map<string, PackageManifest> {
  const grouped = new Map<string, ManifestLine[]>(packageIds.map((id) => [id, []]));
  for (const row of rows) {
    grouped.get(row.package_id)?.push(toLine(row));
  }
  const out = new Map<string, PackageManifest>();
  for (const [id, lines] of grouped) {
    const items = [...lines].sort(compareLines);
    out.set(id, { items, summary: summarize(items) });
  }
  return out;
}
