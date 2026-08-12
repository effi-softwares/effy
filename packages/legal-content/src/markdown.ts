import type { Block, InlineRun } from "./types"

/**
 * The ONE definition of the constrained Markdown subset (Principle II). Both the web renderer and the
 * `legal:check` guard use this, so a document cannot parse on one surface and break on another.
 *
 * Supported: `#`/`##`/`###` headings, paragraphs, `-`/`*` unordered lists, `1.` ordered lists,
 * pipe tables (`| a | b |` with a `---` separator row), and inline `**bold**`, `*italic*`,
 * `[label](href)`. Anything the parser cannot classify raises — that is the subset guard.
 */

export class MarkdownSubsetError extends Error {}

const HEADING = /^(#{1,3})\s+(.*)$/
const UL = /^[-*]\s+(.*)$/
const OL = /^\d+\.\s+(.*)$/
const TABLE_ROW = /^\|(.+)\|\s*$/
const TABLE_SEP = /^\|[\s:|-]+\|\s*$/

export function parseMarkdown(src: string): Block[] {
  const lines = src.replace(/\r\n/g, "\n").split("\n")
  const blocks: Block[] = []
  let i = 0

  const flushParagraph = (buf: string[]) => {
    if (buf.length === 0) return
    blocks.push({ kind: "paragraph", runs: parseInline(buf.join(" ").trim()) })
    buf.length = 0
  }

  let para: string[] = []
  while (i < lines.length) {
    const line = lines[i] ?? ""
    const trimmed = line.trim()

    if (trimmed === "") {
      flushParagraph(para)
      i++
      continue
    }

    const h = HEADING.exec(trimmed)
    if (h) {
      flushParagraph(para)
      blocks.push({ kind: "heading", level: h[1]!.length as 1 | 2 | 3, runs: parseInline(h[2]!.trim()) })
      i++
      continue
    }

    // Table: a row line immediately followed by a separator row.
    if (TABLE_ROW.test(trimmed) && i + 1 < lines.length && TABLE_SEP.test((lines[i + 1] ?? "").trim())) {
      flushParagraph(para)
      const header = splitRow(trimmed)
      const rows: InlineRun[][][] = []
      i += 2
      while (i < lines.length && TABLE_ROW.test((lines[i] ?? "").trim())) {
        rows.push(splitRow((lines[i] ?? "").trim()))
        i++
      }
      blocks.push({ kind: "table", header, rows })
      continue
    }

    if (UL.test(trimmed) || OL.test(trimmed)) {
      flushParagraph(para)
      const ordered = OL.test(trimmed)
      const items: InlineRun[][] = []
      while (i < lines.length) {
        const t = (lines[i] ?? "").trim()
        const m = ordered ? OL.exec(t) : UL.exec(t)
        if (!m) break
        items.push(parseInline(m[1]!.trim()))
        i++
      }
      blocks.push({ kind: "list", ordered, items })
      continue
    }

    // A bare pipe line with no separator is a malformed table — reject rather than render as text.
    if (TABLE_ROW.test(trimmed) && !para.length) {
      throw new MarkdownSubsetError(`Table row without a separator row: ${trimmed}`)
    }

    para.push(trimmed)
    i++
  }
  flushParagraph(para)
  return blocks
}

function splitRow(line: string): InlineRun[][] {
  const inner = line.replace(/^\|/, "").replace(/\|\s*$/, "")
  return inner.split("|").map((cell) => parseInline(cell.trim()))
}

const INLINE = /(\*\*[^*]+\*\*|\*[^*]+\*|\[[^\]]+\]\([^)]+\))/g

export function parseInline(text: string): InlineRun[] {
  const runs: InlineRun[] = []
  let last = 0
  let m: RegExpExecArray | null
  INLINE.lastIndex = 0
  while ((m = INLINE.exec(text)) !== null) {
    if (m.index > last) runs.push({ text: text.slice(last, m.index) })
    const tok = m[0]
    if (tok.startsWith("**")) {
      runs.push({ text: tok.slice(2, -2), bold: true })
    } else if (tok.startsWith("*")) {
      runs.push({ text: tok.slice(1, -1), italic: true })
    } else {
      const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(tok)!
      runs.push({ text: link[1]!, href: link[2]! })
    }
    last = m.index + tok.length
  }
  if (last < text.length) runs.push({ text: text.slice(last) })
  return runs.length ? runs : [{ text }]
}
