/**
 * The units a number attribute may be entered in (101). A closed set of families, each with one base unit
 * and exact factors to it: values are kept as entered (1.5 kg) and also in the base unit (1500 g), so a
 * range filter compares like with like. A new family needs a release; new attributes do not.
 *
 * `count` units are never converted into one another: an attribute in that family names exactly one unit.
 * The migration's `attribute_definition_unit_family_check` lists the same families.
 */
export type UnitFamily =
  | "mass"
  | "volume"
  | "length"
  | "area"
  | "power"
  | "voltage"
  | "battery"
  | "data"
  | "duration"
  | "temperature"
  | "count"

interface FamilyDef {
  label: string
  base: string
  /** Unit symbol → how many base units one of it is. */
  units: Readonly<Record<string, number>>
}

export const UNIT_FAMILIES: Readonly<Record<UnitFamily, FamilyDef>> = {
  mass: { label: "Weight", base: "g", units: { mg: 0.001, g: 1, kg: 1000 } },
  volume: { label: "Volume", base: "mL", units: { mL: 1, L: 1000 } },
  length: { label: "Length", base: "mm", units: { mm: 1, cm: 10, m: 1000, in: 25.4 } },
  area: { label: "Area", base: "cm²", units: { "cm²": 1, "m²": 10000 } },
  power: { label: "Power", base: "W", units: { W: 1, kW: 1000 } },
  voltage: { label: "Voltage", base: "V", units: { V: 1 } },
  battery: { label: "Battery capacity", base: "mAh", units: { mAh: 1 } },
  data: { label: "Data capacity", base: "GB", units: { GB: 1, TB: 1000 } },
  // Months and years are fixed at 30 and 365 days: good for a warranty, never for a calendar.
  duration: { label: "Duration", base: "min", units: { min: 1, h: 60, d: 1440, mo: 43200, y: 525600 } },
  temperature: { label: "Temperature", base: "°C", units: { "°C": 1 } },
  count: { label: "Count", base: "pieces", units: { pieces: 1, sheets: 1, rolls: 1, packs: 1 } },
}

export const UNIT_FAMILY_KEYS = Object.keys(UNIT_FAMILIES) as UnitFamily[]

/** How a unit is said after a number: "12 pieces", "2 years". Symbols not listed are written as is. */
const UNIT_WORDS: Readonly<Record<string, [singular: string, plural: string]>> = {
  pieces: ["piece", "pieces"],
  sheets: ["sheet", "sheets"],
  rolls: ["roll", "rolls"],
  packs: ["pack", "packs"],
  mo: ["month", "months"],
  y: ["year", "years"],
  d: ["day", "days"],
  h: ["hour", "hours"],
  min: ["minute", "minutes"],
}

export function isUnitFamily(value: unknown): value is UnitFamily {
  return typeof value === "string" && value in UNIT_FAMILIES
}

export function unitsOf(family: UnitFamily): string[] {
  return Object.keys(UNIT_FAMILIES[family].units)
}

export function unitBelongs(family: UnitFamily, unit: string): boolean {
  return Object.hasOwn(UNIT_FAMILIES[family].units, unit)
}

const round6 = (n: number) => Math.round(n * 1e6) / 1e6

/** The value in its family's base unit, rounded to six decimals. Throws for a unit outside the family. */
export function toBase(value: number, family: UnitFamily, unit: string): number {
  const factor = UNIT_FAMILIES[family].units[unit]
  if (factor === undefined) throw new Error(`"${unit}" is not a ${family} unit`)
  return round6(value * factor)
}

export function fromBase(base: number, family: UnitFamily, unit: string): number {
  const factor = UNIT_FAMILIES[family].units[unit]
  if (factor === undefined) throw new Error(`"${unit}" is not a ${family} unit`)
  return round6(base / factor)
}

/** "1.5 kg", "65 in", "12 pieces", "1 year". A number is written without trailing zeros. */
export function formatQuantity(value: number, unit: string | null): string {
  const n = Number.isInteger(value) ? String(value) : String(round6(value))
  if (!unit) return n
  const words = UNIT_WORDS[unit]
  if (words) return `${n} ${value === 1 ? words[0] : words[1]}`
  return `${n} ${unit}`
}
