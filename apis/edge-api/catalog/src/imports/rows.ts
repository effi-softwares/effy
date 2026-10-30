// A shop's spreadsheet, row by row (102). Pure: it reads the header, groups the rows that are variants of one
// product, and turns each group into the very body Effy's form sends — `parseCreateInput` then judges it by
// the form's own rules. What a cell cannot even say (an unknown aisle, "yes-ish" for 18+) is named here,
// against its row and column.

import { randomUUID } from "node:crypto";

import {
  PACK_UNITS,
  type CategoryFormRow,
  type DetailInput,
  type DetailValue,
  type OptionInputDTO,
  type PackUnit,
  type ProductImportProblemDTO,
  type VariantInputDTO,
} from "@effy/shared-types";

/** The template's fixed columns, in order. Detail columns follow as `Detail: <name>`. */
export const IMPORT_COLUMNS = [
  { name: "Product key", required: true, help: "The same key on every row that is a variant of one product." },
  { name: "Name", required: true, help: "What customers see." },
  { name: "Brand", required: false, help: "" },
  { name: "Short description", required: true, help: "One line." },
  { name: "Long description", required: false, help: "" },
  { name: "Category", required: true, help: "The full aisle, e.g. Dairy › Milk › Full cream (one with no aisles below it)." },
  { name: "Storage", required: false, help: "Room temperature, Chilled or Frozen. Empty: the aisle's default." },
  { name: "GST", required: false, help: "Taxable or GST-free. Empty: the aisle's default." },
  { name: "18+", required: false, help: "Yes or No. Empty: the aisle's default." },
  { name: "Option 1 name", required: false, help: "For a product with variants: an option the aisle offers, e.g. Flavour." },
  { name: "Option 1 value", required: false, help: "This row's value, from that option's list, e.g. Strawberry." },
  { name: "Option 2 name", required: false, help: "" },
  { name: "Option 2 value", required: false, help: "" },
  { name: "SKU", required: true, help: "The shop's own code for this variant; unique in the shop." },
  { name: "Barcode", required: false, help: "" },
  { name: "Shop price", required: true, help: "What the shop is paid, e.g. 4.50." },
  { name: "Compare-at price", required: false, help: "A 'was' price, if any." },
  { name: "Weight (g)", required: false, help: "Shipping weight in grams." },
  { name: "Net quantity", required: false, help: "How much is in the pack, e.g. 500 (with Net unit g). For the unit price." },
  { name: "Net unit", required: false, help: "g, kg, ml, l, m, m2, sheets or each." },
  { name: "Picture links", required: false, help: "https links separated by |. The first is the main picture." },
] as const;

export const DETAIL_PREFIX = "Detail:";

type Fixed = (typeof IMPORT_COLUMNS)[number]["name"];

export interface Header {
  index: Map<Fixed, number>;
  details: { name: string; index: number }[];
}

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

/** Columns renamed since a template was downloaded (105): named, never mapped silently. */
const RENAMED: Record<string, string> = { "pack quantity": "Net quantity", "pack unit": "Net unit" };

/** The sheet's header: every column known, every required column present, none twice. */
export function readHeader(columns: readonly string[]): { header: Header } | { problems: string[] } {
  const problems: string[] = [];
  const index = new Map<Fixed, number>();
  const details: Header["details"] = [];
  const byName = new Map(IMPORT_COLUMNS.map((c) => [norm(c.name), c.name]));
  columns.forEach((raw, i) => {
    const name = raw.trim();
    if (name === "") return;
    if (norm(name).startsWith(norm(DETAIL_PREFIX))) {
      const detail = name.slice(DETAIL_PREFIX.length).trim();
      if (!detail) problems.push(`column ${i + 1}: a detail column names no detail`);
      else details.push({ name: detail, index: i });
      return;
    }
    const fixed = byName.get(norm(name));
    const renamed = RENAMED[norm(name)];
    if (!fixed && renamed) return problems.push(`"${name}" is now "${renamed}": rename the column`);
    if (!fixed) return problems.push(`"${name}" is not a column the template has`);
    if (index.has(fixed)) return problems.push(`"${fixed}" appears twice`);
    index.set(fixed, i);
  });
  for (const c of IMPORT_COLUMNS) if (c.required && !index.has(c.name)) problems.push(`the "${c.name}" column is missing`);
  return problems.length > 0 ? { problems } : { header: { index, details } };
}

export interface SheetRow {
  rowNumber: number;
  cells: readonly string[];
}

export const cell = (h: Header, row: SheetRow, col: Fixed): string => {
  const i = h.index.get(col);
  return i === undefined ? "" : (row.cells[i] ?? "").trim();
};

export interface ProductGroup {
  key: string;
  rows: SheetRow[];
}

/** Rows that share a product key are one product, in sheet order. A row with no key is its own. */
export function groupRows(h: Header, rows: readonly SheetRow[]): ProductGroup[] {
  const groups = new Map<string, ProductGroup>();
  for (const row of rows) {
    const key = cell(h, row, "Product key") || `row-${row.rowNumber}`;
    const g = groups.get(key.toLowerCase()) ?? { key, rows: [] };
    g.rows.push(row);
    groups.set(key.toLowerCase(), g);
  }
  return [...groups.values()];
}

/** Picture links on the product's rows, first to last, without repeats. */
export function pictureLinks(h: Header, g: ProductGroup): string[] {
  const out: string[] = [];
  for (const row of g.rows) {
    for (const link of cell(h, row, "Picture links").split("|").map((s) => s.trim()).filter(Boolean)) {
      if (!out.includes(link)) out.push(link);
    }
  }
  return out;
}

export interface RowProblem extends ProductImportProblemDTO {
  rowNumber: number;
}

/** A leaf as the sheet names it: by its full path, case and separators aside, or by its id. */
export interface LeafLookup {
  byPath: (text: string) => { id: string; isLeaf: boolean } | null;
}

export const pathKey = (parts: readonly string[]) => parts.map(norm).join("›");

export function splitPath(text: string): string[] {
  return text.split(/\s*(?:›|>|\/|\\)\s*/).map((s) => s.trim()).filter(Boolean);
}

const STORAGE: Record<string, "ambient" | "chilled" | "frozen"> = {
  "room temperature": "ambient", ambient: "ambient", "shelf stable": "ambient", chilled: "chilled", fridge: "chilled", frozen: "frozen",
};
const GST: Record<string, "taxable" | "gst_free"> = { taxable: "taxable", "gst-free": "gst_free", "gst free": "gst_free", free: "gst_free" };
const YES = new Set(["yes", "y", "true", "1"]);
const NO = new Set(["no", "n", "false", "0"]);
const MONEY = /^\$?\s*(\d+(?:\.\d{1,2})?)$/;

/** One detail cell in the value shape its attribute takes; null with a reason when it cannot be one. */
export function parseDetailCell(row: CategoryFormRow, text: string): { value: DetailValue } | { problem: string } {
  const t = text.trim();
  switch (row.inputType) {
    case "short_text":
    case "long_text":
      return { value: { text: t } };
    case "number": {
      const m = /^(-?\d+(?:\.\d+)?)\s*([^\d\s].*)?$/.exec(t);
      if (!m) return { problem: "is not a number" };
      const unit = m[2]?.trim() ?? null;
      if (unit && row.units.length > 0 && !row.units.some((u) => u.toLowerCase() === unit.toLowerCase())) {
        return { problem: `unit must be one of ${row.units.join(", ")}` };
      }
      const canonical = unit ? (row.units.find((u) => u.toLowerCase() === unit.toLowerCase()) ?? unit) : null;
      return { value: { number: m[1]!, unit: canonical } };
    }
    case "boolean":
      if (YES.has(t.toLowerCase())) return { value: { boolean: true } };
      if (NO.has(t.toLowerCase())) return { value: { boolean: false } };
      return { problem: "must be Yes or No" };
    case "single_select":
    case "multi_select": {
      const labels = row.inputType === "single_select" ? [t] : t.split(/\s*[|,]\s*/).filter(Boolean);
      const ids: string[] = [];
      for (const label of labels) {
        const v = row.values.find((x) => norm(x.label) === norm(label));
        if (!v) return { problem: `"${label}" is not one of: ${row.values.map((x) => x.label).join(", ")}` };
        ids.push(v.id);
      }
      return { value: { valueIds: ids } };
    }
    case "date": {
      const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
      const au = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(t);
      if (iso) return { value: { date: t } };
      if (au) return { value: { date: `${au[3]}-${au[2]!.padStart(2, "0")}-${au[1]!.padStart(2, "0")}` } };
      return { problem: "must be a date such as 2026-10-27" };
    }
    case "time":
      return /^\d{1,2}:\d{2}$/.test(t) ? { value: { time: t.padStart(5, "0") } } : { problem: "must be a time such as 09:30" };
  }
}

export interface Built {
  /** The form body, ready for `parseCreateInput`; null when a cell already made it impossible. */
  body: Record<string, unknown> | null;
  problems: RowProblem[];
  /** Variant ids in row order: maps the form's `variants[i]` errors back to rows. */
  variantRows: number[];
  leafId: string | null;
}

/**
 * One product's rows as Effy's form body. `formOf` gives the leaf's form once the category is known.
 */
export function buildBody(
  h: Header,
  g: ProductGroup,
  leaves: LeafLookup,
  formOf: (leafId: string) => readonly CategoryFormRow[],
): Built {
  const problems: RowProblem[] = [];
  const first = g.rows[0]!;
  const say = (row: SheetRow, column: string | null, message: string) => problems.push({ rowNumber: row.rowNumber, column, message });

  // The product's own columns come from its first row; a later row that says otherwise is a mistake.
  for (const col of ["Name", "Brand", "Short description", "Long description", "Category", "Storage", "GST", "18+", "Option 1 name", "Option 2 name"] as const) {
    for (const row of g.rows.slice(1)) {
      const v = cell(h, row, col);
      if (v !== "" && v !== cell(h, first, col)) say(row, col, `differs from row ${first.rowNumber} of the same product`);
    }
  }

  const categoryText = cell(h, first, "Category");
  const leaf = categoryText ? leaves.byPath(categoryText) : null;
  if (!categoryText) say(first, "Category", "is required");
  else if (!leaf) say(first, "Category", "is not an aisle Effy has");
  else if (!leaf.isLeaf) say(first, "Category", "has aisles below it — choose one of those");
  const form = leaf?.isLeaf ? formOf(leaf.id) : [];

  const fact = <T>(col: "Storage" | "GST" | "18+", map: (v: string) => T | undefined): T | undefined => {
    const v = cell(h, first, col);
    if (v === "") return undefined;
    const out = map(v.toLowerCase());
    if (out === undefined) say(first, col, col === "Storage" ? "must be Room temperature, Chilled or Frozen" : col === "GST" ? "must be Taxable or GST-free" : "must be Yes or No");
    return out;
  };
  const storage = fact("Storage", (v) => STORAGE[v]);
  const gstStatus = fact("GST", (v) => GST[v]);
  const ageRestricted = fact("18+", (v) => (YES.has(v) ? true : NO.has(v) ? false : undefined));

  // Options: up to two, named once, valued per row.
  const options: OptionInputDTO[] = [];
  const optionValueOf: Array<Map<string, string>> = [new Map(), new Map()];
  const sized = g.rows.length > 1;
  for (const [slot, nameCol, valueCol] of [[0, "Option 1 name", "Option 1 value"], [1, "Option 2 name", "Option 2 value"]] as const) {
    const name = cell(h, first, nameCol);
    if (!name) continue;
    // The only options are the aisle's own (105).
    const attr = form.find((r) => r.variantOption && norm(r.name) === norm(name));
    if (!attr) {
      say(first, nameCol, leaf?.isLeaf ? `"${name}" is not an option this aisle offers` : "cannot be checked until the aisle is right");
      continue;
    }
    const option: OptionInputDTO = { id: randomUUID(), position: slot + 1, attributeId: attr.attributeId, values: [] };
    for (const row of g.rows) {
      const v = cell(h, row, valueCol);
      if (!v) {
        say(row, valueCol, "is required when the option is named");
        continue;
      }
      if (optionValueOf[slot]!.has(norm(v))) continue;
      const allowed = attr.values.find((x) => norm(x.label) === norm(v));
      if (!allowed) {
        say(row, valueCol, `"${v}" is not one of: ${attr.values.map((x) => x.label).join(", ")}`);
        continue;
      }
      const id = randomUUID();
      optionValueOf[slot]!.set(norm(v), id);
      option.values.push({ id, allowedValueId: allowed.id, position: option.values.length });
    }
    options.push(option);
  }
  if (sized && options.length === 0) say(first, "Option 1 name", "a product on several rows needs an option the aisle offers");

  const variants: VariantInputDTO[] = [];
  const variantRows: number[] = [];
  g.rows.forEach((row, i) => {
    const price = MONEY.exec(cell(h, row, "Shop price"));
    if (!price) say(row, "Shop price", "must be an amount such as 4.50");
    const compareText = cell(h, row, "Compare-at price");
    const compare = compareText ? MONEY.exec(compareText) : null;
    if (compareText && !compare) say(row, "Compare-at price", "must be an amount such as 5.00");
    const weightText = cell(h, row, "Weight (g)");
    if (weightText && !/^\d+$/.test(weightText)) say(row, "Weight (g)", "must be a whole number of grams");
    const sku = cell(h, row, "SKU");
    if (!sku) say(row, "SKU", "is required — it is how a repeat import is recognised");

    // The variant's net quantity: a fact for the unit price, never an option.
    const qty = cell(h, row, "Net quantity");
    // "m²" as typed is the template's "m2".
    const unitText = cell(h, row, "Net unit").toLowerCase().replace("²", "2");
    if (unitText && !(PACK_UNITS as readonly string[]).includes(unitText)) say(row, "Net unit", `must be one of ${PACK_UNITS.join(", ")}`);

    const ids: [string | null, string | null] = [null, null];
    options.forEach((o) => {
      const v = cell(h, row, o.position === 1 ? "Option 1 value" : "Option 2 value");
      ids[o.position - 1] = optionValueOf[o.position - 1]!.get(norm(v)) ?? null;
    });
    variants.push({
      id: randomUUID(),
      position: i,
      optionValueIds: ids,
      sku: sku || null,
      gtin: cell(h, row, "Barcode") || null,
      shopPriceAmount: price?.[1] ?? "",
      shopCompareAtAmount: compare?.[1] ?? null,
      weightGrams: weightText && /^\d+$/.test(weightText) ? Number(weightText) : null,
      packQuantity: qty || null,
      packUnit: (unitText || null) as PackUnit | null,
      mediaStorageKey: null,
    });
    variantRows.push(row.rowNumber);
  });

  // Details: same on every row is the product's; different per row only where the detail may differ by size.
  const details: DetailInput[] = [];
  for (const col of h.details) {
    const row = form.find((r) => norm(r.name) === norm(col.name));
    const texts = g.rows.map((r) => (r.cells[col.index] ?? "").trim());
    if (texts.every((t) => t === "")) continue;
    if (!row) {
      if (leaf?.isLeaf) say(first, `${DETAIL_PREFIX} ${col.name}`, "this aisle does not ask for it");
      continue;
    }
    const parsed = texts.map((t, i) => {
      if (t === "") return null;
      const p = parseDetailCell(row, t);
      if ("problem" in p) say(g.rows[i]!, `${DETAIL_PREFIX} ${col.name}`, p.problem);
      return "value" in p ? p.value : null;
    });
    const same = parsed.every((p) => JSON.stringify(p) === JSON.stringify(parsed[0]));
    if (same && parsed[0]) details.push({ attributeId: row.attributeId, value: parsed[0] });
    else if (!same && row.variesByVariant) {
      details.push({
        attributeId: row.attributeId,
        perVariant: parsed.flatMap((value, i) => (value ? [{ variantId: variants[i]!.id, value }] : [])),
      });
    } else if (!same) say(g.rows[1]!, `${DETAIL_PREFIX} ${col.name}`, "is the same for every variant of a product — it cannot differ");
  }

  if (problems.length > 0 || !leaf?.isLeaf) return { body: null, problems, variantRows, leafId: leaf?.isLeaf ? leaf.id : null };
  return {
    body: {
      primaryCategoryId: leaf.id,
      name: cell(h, first, "Name"),
      brand: cell(h, first, "Brand") || null,
      shortDescription: cell(h, first, "Short description"),
      longDescription: cell(h, first, "Long description") || null,
      ...(storage !== undefined ? { storage } : {}),
      ...(gstStatus !== undefined ? { gstStatus } : {}),
      ...(ageRestricted !== undefined ? { ageRestricted } : {}),
      unitBasis: null,
      options,
      variants,
      details,
    },
    problems,
    variantRows,
    leafId: leaf.id,
  };
}

/** The form's own field errors, put back on the rows they came from. */
export function formProblems(fields: readonly { field: string; message: string }[], built: Built, first: number): RowProblem[] {
  return fields.map((f) => {
    const v = /^variants\[(\d+)\]/.exec(f.field);
    const rowNumber = v ? (built.variantRows[Number(v[1])] ?? first) : first;
    return { rowNumber, column: null, message: `${f.field}: ${f.message}` };
  });
}

/** SKUs used twice in the sheet, case aside: every row that shares one is told. */
export function duplicateSkus(h: Header, rows: readonly SheetRow[]): RowProblem[] {
  const seen = new Map<string, number[]>();
  for (const row of rows) {
    const sku = cell(h, row, "SKU").toLowerCase();
    if (sku) seen.set(sku, [...(seen.get(sku) ?? []), row.rowNumber]);
  }
  const out: RowProblem[] = [];
  for (const [, numbers] of seen) {
    if (numbers.length < 2) continue;
    for (const n of numbers) out.push({ rowNumber: n, column: "SKU", message: `is used on rows ${numbers.join(", ")}` });
  }
  return out;
}
