// The driver's item manifest (065) — pure. Rows in, wire lines and a class summary out.
//
// ⚠ ONE BUILDER, TWO CALLERS. The shop pickup and the customer drop both render a package's items;
// if each mapped its own rows the class label, the "in the bag" rule or the ordering would drift
// between the two screens a driver reads in the same shift.

import type { ClassSummary, ManifestLine, TemperatureClass } from "@effy/shared-types";

/** One order line of one package, as PACKAGE_ITEMS returns it. */
export interface ManifestRow {
  package_id: string;
  name: string;
  ordered_qty: number | string;
  /** `order_item.storage_class` — the catalogue's word, snapshotted at placement. NULL = pre-065. */
  storage_class: string | null;
  /** `fulfillment_item.gathered_quantity`, or NULL when the line has no pick row at all. */
  gathered_qty: number | string | null;
}

/**
 * The catalogue's storage value → what a driver is shown.
 *
 * ⚠ THERE IS DELIBERATELY NO `default → "normal"`. NULL is a line sold before the class was
 * snapshotted, and nobody knows what it was; reading it as Normal would tell a driver a frozen item
 * can ride in the ambient compartment (FR-010, SC-008). An unrecognised non-null value is treated the
 * same way — the column's CHECK admits three values, so reaching that branch means the schema moved
 * and this mapping did not, which is not a reason to assert a class.
 */
export function toTemperatureClass(storageClass: string | null): TemperatureClass {
  switch (storageClass) {
    case "frozen":
      return "frozen";
    case "chilled":
      return "chilled";
    case "ambient":
      return "normal";
    default:
      return "not_recorded";
  }
}

const CLASS_ORDER: Record<TemperatureClass, number> = {
  frozen: 0,
  chilled: 1,
  normal: 2,
  not_recorded: 3,
};

function toLine(row: ManifestRow): ManifestLine {
  const ordered = Number(row.ordered_qty);
  // ⚠ "No pick row" is NOT "nothing gathered". fulfillment_item rows are created lazily when picking
  // begins, so a line without one has simply not been through the console's picking — the driver is
  // shown what was ordered rather than an empty bag. A row that EXISTS with zero gathered is the
  // shop saying it supplied none.
  const qty = row.gathered_qty === null ? ordered : Number(row.gathered_qty);
  return {
    name: row.name,
    qty,
    orderedQty: ordered,
    included: qty > 0,
    temperatureClass: toTemperatureClass(row.storage_class),
  };
}

/** Cold goods first, what is in the bag before what is not, then by name. */
function compareLines(a: ManifestLine, b: ManifestLine): number {
  return (
    CLASS_ORDER[a.temperatureClass] - CLASS_ORDER[b.temperatureClass] ||
    Number(b.included) - Number(a.included) ||
    a.name.localeCompare(b.name)
  );
}

export const EMPTY_SUMMARY: ClassSummary = { frozen: 0, chilled: 0, normal: 0, notRecorded: 0 };

/** Units in the bag per class. A line the shop did not supply is in no bucket (FR-016). */
export function summarize(lines: readonly ManifestLine[]): ClassSummary {
  const s: ClassSummary = { ...EMPTY_SUMMARY };
  for (const l of lines) {
    if (!l.included) continue;
    if (l.temperatureClass === "frozen") s.frozen += l.qty;
    else if (l.temperatureClass === "chilled") s.chilled += l.qty;
    else if (l.temperatureClass === "normal") s.normal += l.qty;
    else s.notRecorded += l.qty;
  }
  return s;
}

export function addSummaries(summaries: readonly ClassSummary[]): ClassSummary {
  const s: ClassSummary = { ...EMPTY_SUMMARY };
  for (const x of summaries) {
    s.frozen += x.frozen;
    s.chilled += x.chilled;
    s.normal += x.normal;
    s.notRecorded += x.notRecorded;
  }
  return s;
}

export interface PackageManifest {
  items: ManifestLine[];
  summary: ClassSummary;
}

/**
 * Rows for many packages → each package's OWN manifest.
 *
 * ⚠ KEYED BY PACKAGE. Until 065 the stop read handed every package every row, so three packages of
 * 2, 5 and 1 items each read "8 items" (research R2). A package with no rows gets an empty manifest
 * rather than being absent, so a caller can never mistake "no lines" for "not asked about".
 */
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
