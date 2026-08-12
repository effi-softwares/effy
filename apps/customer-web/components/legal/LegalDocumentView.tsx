import Link from "next/link"

import { getDocument, parseMarkdown, type Block, type InlineRun } from "@effy/legal-content"

/**
 * Renders a legal document from @effy/legal-content — the single source of truth shared with mobile.
 * A SERVER component over the constrained Markdown subset (headings/paragraphs/lists/tables/inline
 * links). It ships ZERO client JS, so every public /legal/* route stays inside the guest-bundle gate.
 */
export function LegalDocumentView({ slug }: { slug: string }) {
  const doc = getDocument(slug)
  const blocks = parseMarkdown(doc.body)

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-16 sm:px-6">
      <h1 className="text-3xl font-semibold tracking-tight">{doc.title}</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Version {doc.currentVersion} · Effective {formatDate(doc.effectiveDate)} ·{" "}
        <Link href={`/legal/${doc.slug}/versions`} className="underline">
          Version history
        </Link>
      </p>
      <div className="mt-8 space-y-4 text-sm leading-relaxed text-foreground/90">
        {blocks.map((block, i) => (
          <BlockView key={i} block={block} />
        ))}
      </div>
    </main>
  )
}

function BlockView({ block }: { block: Block }) {
  switch (block.kind) {
    case "heading": {
      const cls =
        block.level === 1
          ? "mt-10 text-2xl font-semibold tracking-tight text-foreground"
          : block.level === 2
            ? "mt-8 text-lg font-semibold text-foreground"
            : "mt-6 text-base font-medium text-foreground"
      if (block.level === 2) return <h2 className={cls}><Inline runs={block.runs} /></h2>
      if (block.level === 3) return <h3 className={cls}><Inline runs={block.runs} /></h3>
      return <h2 className={cls}><Inline runs={block.runs} /></h2>
    }
    case "paragraph":
      return <p><Inline runs={block.runs} /></p>
    case "list":
      return block.ordered ? (
        <ol className="list-decimal space-y-2 pl-6">
          {block.items.map((item, i) => (
            <li key={i}><Inline runs={item} /></li>
          ))}
        </ol>
      ) : (
        <ul className="list-disc space-y-2 pl-6">
          {block.items.map((item, i) => (
            <li key={i}><Inline runs={item} /></li>
          ))}
        </ul>
      )
    case "table":
      return (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr>
                {block.header.map((cell, i) => (
                  <th key={i} className="border-b px-3 py-2 font-semibold">
                    <Inline runs={cell} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, r) => (
                <tr key={r}>
                  {row.map((cell, c) => (
                    <td key={c} className="border-b px-3 py-2 align-top">
                      <Inline runs={cell} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )
  }
}

function Inline({ runs }: { runs: InlineRun[] }) {
  return (
    <>
      {runs.map((run, i) => {
        let node: React.ReactNode = run.text
        if (run.bold) node = <strong className="font-semibold">{node}</strong>
        else if (run.italic) node = <em>{node}</em>
        if (run.href) {
          const internal = run.href.startsWith("/")
          node = internal ? (
            <Link href={run.href} className="underline underline-offset-2">
              {node}
            </Link>
          ) : (
            <a href={run.href} className="underline underline-offset-2" target="_blank" rel="noopener noreferrer">
              {node}
            </a>
          )
        }
        return <span key={i}>{node}</span>
      })}
    </>
  )
}

function formatDate(iso: string): string {
  const [y, m, d] = iso.split("-")
  const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]
  return `${Number(d)} ${months[Number(m) - 1]} ${y}`
}
