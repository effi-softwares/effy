import { describe, expect, it } from "vitest";

import type { CategoryFormRow } from "@effy/shared-types";

import {
  buildBody, duplicateSkus, formProblems, groupRows, IMPORT_COLUMNS, parseDetailCell, pathKey, pictureLinks,
  readHeader, splitPath, type Header, type LeafLookup, type SheetRow,
} from "./rows";

const COLUMNS = [...IMPORT_COLUMNS.map((c) => c.name), "Detail: Fat content", "Detail: Organic", "Detail: Flavour"];

function header(columns: string[] = COLUMNS): Header {
  const r = readHeader(columns);
  if ("problems" in r) throw new Error(r.problems.join("; "));
  return r.header;
}

/** A sheet row from named cells. */
function row(rowNumber: number, cells: Record<string, string>, columns: string[] = COLUMNS): SheetRow {
  return { rowNumber, cells: columns.map((c) => cells[c] ?? "") };
}

const formRow = (o: Partial<CategoryFormRow> & Pick<CategoryFormRow, "attributeId" | "name" | "inputType">): CategoryFormRow => ({
  key: o.name.toLowerCase(), helpText: null, unitFamily: null, units: [], min: null, max: null, decimals: null, maxLength: null,
  values: [], level: "optional", section: "Details", position: 0, filterable: false, customerVisible: true,
  variesByVariant: false, variantOption: false, ...o,
});

const FORM: CategoryFormRow[] = [
  formRow({ attributeId: "fat", name: "Fat content", inputType: "number", units: ["%"] }),
  formRow({ attributeId: "organic", name: "Organic", inputType: "boolean", variesByVariant: true }),
  formRow({ attributeId: "flavour", name: "Flavour", inputType: "single_select", variantOption: true, values: [{ id: "v-plain", label: "Plain" }, { id: "v-mango", label: "Mango" }] }),
];

const LEAVES: LeafLookup = {
  byPath: (text) => {
    const key = pathKey(splitPath(text));
    if (key === pathKey(["Dairy", "Yoghurt", "Greek"]) || text === "leaf-id") return { id: "leaf-id", isLeaf: true };
    if (key === pathKey(["Dairy"])) return { id: "dept", isLeaf: false };
    return null;
  },
};

const BASE = { "Product key": "Y1", Name: "Greek yoghurt", "Short description": "Thick", Category: "Dairy > Yoghurt > Greek", SKU: "Y-500", "Shop price": "4.50" };

const build = (rows: SheetRow[], h = header()) => buildBody(h, groupRows(h, rows)[0]!, LEAVES, () => FORM);

describe("102 — reading an import sheet", () => {
  it("knows its columns, case and spacing aside, and refuses an unknown, repeated or missing one", () => {
    expect("header" in readHeader(["product KEY", " name ", "Short Description", "category", "sku", "shop price"])).toBe(true);
    expect(readHeader([...COLUMNS, "Colour"])).toEqual({ problems: ['"Colour" is not a column the template has'] });
    expect(readHeader([...COLUMNS, "SKU"])).toEqual({ problems: ['"SKU" appears twice'] });
    expect(readHeader(["Name"])).toMatchObject({ problems: expect.arrayContaining(['the "SKU" column is missing']) });
  });

  it("groups rows by product key, case aside, keeping sheet order", () => {
    const h = header();
    const groups = groupRows(h, [row(2, { "Product key": "A" }), row(3, { "Product key": "b" }), row(4, { "Product key": "a" }), row(5, {})]);
    expect(groups.map((g) => [g.key, g.rows.map((r) => r.rowNumber)])).toEqual([["A", [2, 4]], ["b", [3]], ["row-5", [5]]]);
  });

  it("builds the form body for a one-size product, facts left to the aisle", () => {
    const b = build([row(2, { ...BASE, "Detail: Fat content": "10 %", "Detail: Organic": "yes", "Picture links": "https://x/a.jpg | https://x/b.jpg" })]);
    expect(b.problems).toEqual([]);
    expect(b.body).toMatchObject({
      primaryCategoryId: "leaf-id", name: "Greek yoghurt", options: [],
      variants: [{ sku: "Y-500", shopPriceAmount: "4.50", optionValueIds: [null, null] }],
      details: [{ attributeId: "fat", value: { number: "10", unit: "%" } }, { attributeId: "organic", value: { boolean: true } }],
    });
    expect(b.body).not.toHaveProperty("storage");
    expect(pictureLinks(header(), groupRows(header(), [row(2, { ...BASE, "Picture links": "https://x/a.jpg|https://x/b.jpg" })])[0]!)).toEqual([
      "https://x/a.jpg", "https://x/b.jpg",
    ]);
  });

  it("makes variants from rows by the aisle's own option, each row with its own net quantity", () => {
    const b = build([
      row(2, { ...BASE, "Option 1 name": "Flavour", "Option 1 value": "Plain", "Net quantity": "500", "Net unit": "g" }),
      row(3, { ...BASE, SKU: "Y-1K", "Shop price": "8.00", "Option 1 name": "Flavour", "Option 1 value": "Mango", "Net quantity": "1", "Net unit": "kg" }),
    ]);
    expect(b.problems).toEqual([]);
    const body = b.body as { options: { attributeId: string; values: unknown[] }[]; variants: { packQuantity: string; packUnit: string }[] };
    expect(body.options.map((o) => [o.attributeId, o.values.length])).toEqual([["flavour", 2]]);
    expect(body.options[0]).not.toHaveProperty("kind");
    expect(body.variants.map((v) => `${v.packQuantity} ${v.packUnit}`)).toEqual(["500 g", "1 kg"]);
    expect(b.variantRows).toEqual([2, 3]);
  });

  it("105 — Pack size is not an option unless the aisle offers one by that name; old pack columns are named, not mapped", () => {
    const b = build([
      row(2, { ...BASE, "Option 1 name": "Pack size", "Option 1 value": "500 g" }),
      row(3, { ...BASE, SKU: "Y-1K", "Option 1 name": "Pack size", "Option 1 value": "1 kg" }),
    ]);
    expect(b.problems).toContainEqual({ rowNumber: 2, column: "Option 1 name", message: '"Pack size" is not an option this aisle offers' });
    const old = readHeader([...IMPORT_COLUMNS.map((c) => c.name).filter((n) => n !== "Net quantity" && n !== "Net unit"), "Pack quantity", "Pack unit"]);
    expect(old).toEqual({ problems: ['"Pack quantity" is now "Net quantity": rename the column', '"Pack unit" is now "Net unit": rename the column'] });
  });

  it("names what a cell cannot say, against its row and column", () => {
    const b = build([
      row(2, { ...BASE, Category: "Dairy", Storage: "warm", "18+": "maybe", "Shop price": "four", "Detail: Organic": "perhaps" }),
    ]);
    expect(b.body).toBeNull();
    expect(b.problems.map((p) => `${p.rowNumber}:${p.column}`)).toEqual(
      expect.arrayContaining(["2:Category", "2:Storage", "2:18+", "2:Shop price"]),
    );
    expect(build([row(2, { ...BASE, Category: "Bakery" })]).problems).toContainEqual({ rowNumber: 2, column: "Category", message: "is not an aisle Effy has" });
    expect(build([row(2, { ...BASE, SKU: "" })]).problems.some((p) => p.column === "SKU")).toBe(true);
  });

  it("refuses rows of one product that disagree, sizes with no option, and a detail that cannot differ", () => {
    const b = build([row(2, BASE), row(3, { ...BASE, Name: "Other", SKU: "Y-2" })]);
    expect(b.problems).toEqual(
      expect.arrayContaining([
        { rowNumber: 3, column: "Name", message: "differs from row 2 of the same product" },
        { rowNumber: 2, column: "Option 1 name", message: "a product on several rows needs an option the aisle offers" },
      ]),
    );
    const fat = build([
      row(2, { ...BASE, "Option 1 name": "Flavour", "Option 1 value": "Plain", "Detail: Fat content": "10 %" }),
      row(3, { ...BASE, SKU: "Y-2", "Option 1 name": "Flavour", "Option 1 value": "Mango", "Detail: Fat content": "5 %" }),
    ]);
    expect(fat.problems).toContainEqual({ rowNumber: 3, column: "Detail: Fat content", message: "is the same for every variant of a product — it cannot differ" });
  });

  it("lets a detail that may differ by variant differ, one value per variant", () => {
    const b = build([
      row(2, { ...BASE, "Option 1 name": "Flavour", "Option 1 value": "Plain", "Detail: Organic": "yes" }),
      row(3, { ...BASE, SKU: "Y-2", "Option 1 name": "Flavour", "Option 1 value": "Mango", "Detail: Organic": "no" }),
    ]);
    const details = (b.body as { details: { attributeId: string; perVariant?: unknown[] }[] }).details;
    expect(details).toEqual([{ attributeId: "organic", perVariant: [expect.objectContaining({ value: { boolean: true } }), expect.objectContaining({ value: { boolean: false } })] }]);
  });

  it("finds SKUs used twice in the sheet, case aside", () => {
    const h = header();
    expect(duplicateSkus(h, [row(2, { SKU: "A1" }), row(3, { SKU: "b" }), row(4, { SKU: "a1" })])).toEqual([
      { rowNumber: 2, column: "SKU", message: "is used on rows 2, 4" },
      { rowNumber: 4, column: "SKU", message: "is used on rows 2, 4" },
    ]);
  });

  it("puts the form's own errors back on their rows", () => {
    const b = build([row(2, BASE)]);
    expect(formProblems([{ field: "variants[0].sku", message: "too long" }, { field: "name", message: "x" }], b, 2)).toEqual([
      { rowNumber: 2, column: null, message: "variants[0].sku: too long" },
      { rowNumber: 2, column: null, message: "name: x" },
    ]);
  });

  it("reads numbers, choices, dates and times as their attributes take them", () => {
    expect(parseDetailCell(FORM[0]!, "10 kg")).toEqual({ problem: "unit must be one of %" });
    expect(parseDetailCell(FORM[2]!, "mango")).toEqual({ value: { valueIds: ["v-mango"] } });
    expect(parseDetailCell(formRow({ attributeId: "d", name: "Best before", inputType: "date" }), "27/10/2026")).toEqual({ value: { date: "2026-10-27" } });
    expect(parseDetailCell(formRow({ attributeId: "t", name: "Ready at", inputType: "time" }), "9:30")).toEqual({ value: { time: "09:30" } });
  });
});
