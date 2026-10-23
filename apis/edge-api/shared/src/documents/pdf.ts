// The printed documents' PDF toolkit: A4, Helvetica, black ink, the wordmark as vector paths, tables
// that break across pages. The standard fonts encode WinAnsi only, so every string goes through `ansi`.
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";

import { WORDMARK_PATHS, WORDMARK_VIEWBOX } from "@effy/shared-types";

import { emitMetric, metricNamespace } from "../lib/metrics";

export const A4 = { w: 595.28, h: 841.89 } as const;
export const MARGIN = 48;
const INK = rgb(0, 0, 0);
const MUTED = rgb(0.36, 0.36, 0.36);
const RULE = rgb(0.8, 0.8, 0.8);

/** Smart punctuation to plain; anything else WinAnsi cannot encode is dropped. */
export function ansi(s: string): string {
  return s
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—−]/g, "-")
    .replace(/…/g, "...")
    .replace(/ /g, " ")
    .replace(/[^\x20-\x7E¡-ÿ€]/g, "");
}

export interface Doc {
  pdf: PDFDocument;
  page: PDFPage;
  regular: PDFFont;
  bold: PDFFont;
  /** The next line's baseline from the top of the page, in points. */
  y: number;
  pages: number;
}

export async function newDocument(title: string): Promise<Doc> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(ansi(title));
  pdf.setAuthor("Effy");
  pdf.setProducer("Effy");
  pdf.setCreator("Effy");
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const page = pdf.addPage([A4.w, A4.h]);
  return { pdf, page, regular, bold, y: MARGIN, pages: 1 };
}

/** pdf-lib measures from the bottom; documents are written top-down. */
const fromTop = (y: number) => A4.h - y;

/** A new page when fewer than [need] points are left; the caller redraws any table header. */
export function ensureRoom(doc: Doc, need: number): boolean {
  if (doc.y + need <= A4.h - MARGIN) return false;
  doc.page = doc.pdf.addPage([A4.w, A4.h]);
  doc.pages += 1;
  doc.y = MARGIN;
  return true;
}

export function text(
  doc: Doc,
  s: string,
  x: number,
  opts: { size?: number; bold?: boolean; muted?: boolean; align?: "left" | "right"; width?: number } = {},
): void {
  const size = opts.size ?? 10;
  const font = opts.bold ? doc.bold : doc.regular;
  let t = ansi(s);
  if (opts.width && font.widthOfTextAtSize(t, size) > opts.width) {
    while (t.length > 1 && font.widthOfTextAtSize(`${t}...`, size) > opts.width) t = t.slice(0, -1);
    t = `${t.trimEnd()}...`;
  }
  const w = font.widthOfTextAtSize(t, size);
  doc.page.drawText(t, { x: opts.align === "right" ? x - w : x, y: fromTop(doc.y), size, font, color: opts.muted ? MUTED : INK });
}

export function wrap(doc: Doc, s: string, width: number, size = 10, bold = false): string[] {
  const font = bold ? doc.bold : doc.regular;
  const words = ansi(s).split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (font.widthOfTextAtSize(next, size) <= width || !line) line = next;
    else {
      lines.push(line);
      line = w;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [""];
}

export function rule(doc: Doc, weight = 0.6, color: "ink" | "light" = "light"): void {
  doc.page.drawLine({
    start: { x: MARGIN, y: fromTop(doc.y) },
    end: { x: A4.w - MARGIN, y: fromTop(doc.y) },
    thickness: weight,
    color: color === "ink" ? INK : RULE,
  });
}

export function wordmark(doc: Doc, h = 22): void {
  const scale = h / WORDMARK_VIEWBOX.h;
  for (const d of WORDMARK_PATHS) doc.page.drawSvgPath(d, { x: MARGIN, y: fromTop(doc.y), scale, color: INK });
  doc.y += h;
}

/** Records `PdfRenderMs` by document kind. */
export async function finish(doc: Doc, kind: string, startedAt: number): Promise<Uint8Array> {
  const bytes = await doc.pdf.save({ useObjectStreams: false });
  emitMetric(metricNamespace(), "PdfRenderMs", Date.now() - startedAt, { kind });
  return bytes;
}
