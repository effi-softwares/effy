import metrics from "./helvetica-metrics.json"

const PT_TO_MM = 25.4 / 72

type Widths = Record<string, number>
const REGULAR = metrics.regular as Widths
const BOLD = metrics.bold as Widths
const FALLBACK = 600

export function textWidthMm(text: string, sizePt: number, opts: { bold?: boolean; mono?: boolean } = {}): number {
  if (opts.mono) return [...text].length * 0.6 * sizePt * PT_TO_MM
  const table = opts.bold ? BOLD : REGULAR
  let units = 0
  for (const ch of text) units += table[ch] ?? FALLBACK
  return (units / 1000) * sizePt * PT_TO_MM
}

interface Fitted {
  sizePt: number
  lines: string[]
}

export function fitText(
  text: string,
  maxWidthMm: number,
  sizesPt: readonly number[],
  maxLines = 2,
  opts: { bold?: boolean; mono?: boolean } = {},
): Fitted {
  const clean = text.replace(/\s+/g, " ").trim()
  if (clean === "") return { sizePt: sizesPt[0]!, lines: [] }
  for (const size of sizesPt) {
    if (textWidthMm(clean, size, opts) <= maxWidthMm) return { sizePt: size, lines: [clean] }
  }
  const size = sizesPt[sizesPt.length - 1]!
  const fits = (s: string) => textWidthMm(s, size, opts) <= maxWidthMm
  const lines: string[] = []
  let current = ""
  const words = clean.split(" ")
  for (let i = 0; i < words.length; i++) {
    const word = words[i]!
    const candidate = current ? `${current} ${word}` : word
    if (fits(candidate)) {
      current = candidate
      continue
    }
    if (current) lines.push(current)
    current = word
    if (lines.length === maxLines - 1) {
      // The last line takes everything left.
      current = [word, ...words.slice(i + 1)].join(" ")
      break
    }
  }
  lines.push(current)
  return { sizePt: size, lines: lines.map((l) => ellipsize(l, fits)) }
}

function ellipsize(line: string, fits: (s: string) => boolean): string {
  if (fits(line)) return line
  let cut = line
  while (cut.length > 0 && !fits(`${cut}…`)) cut = cut.slice(0, -1)
  return `${cut.trimEnd()}…`
}

export { PT_TO_MM }
