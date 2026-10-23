import Link from "next/link"

import { notFound } from "next/navigation"
import { ChevronDown } from "lucide-react"
import { getDocument, parseMarkdown, type Block, type InlineRun } from "@effy/legal-content"

import { Alert } from "@/components/ui/alert"
import { Breadcrumb } from "@/components/ui/misc"

/**
 * Renders a legal document from @effy/legal-content — the single source of truth shared with mobile.
 * A server component over the constrained Markdown subset (headings/paragraphs/lists/tables/inline
 * links). It ships zero client JS, so every public /legal/* route stays inside the guest-bundle gate.
 */
const textOf = (runs: InlineRun[]) => runs.map((r) => r.text).join("")
const anchorOf = (index: number) => `section-${index + 1}`

/**
 * One legal or information document (reference: Help & info · Legal document).
 *
 * The page's sections down a rail on the left ("On this page"), the document on the right; on a
 * phone the rail folds into a disclosure above the text.
 *
 * The text is the authored document, rendered as written. Nothing here adds to, shortens or
 * reorders it — the rail is built from the document's own section headings.
 *
 * An older version says that it is one, at the top, with the way to the current text. Someone
 * reading superseded terms must never take them for the terms in force.
 */
export function LegalDocumentView({ slug, version, home = "legal" }: { slug: string; version?: string; home?: "legal" | "about" }) {
  const doc = getDocument(slug)
  const shown = version ? doc.versions.find((v) => v.version === version) : undefined
  if (version && !shown) notFound()
  const superseded = shown !== undefined && shown.status !== "current"

  const blocks = parseMarkdown(shown?.body ?? doc.body)
  // The rail lists the document's own sections — its second-level headings, in order.
  const sections = blocks.flatMap((b, i) => (b.kind === "heading" && b.level === 2 ? [{ index: i, title: textOf(b.runs) }] : []))
  const contents = (
    <ul className="flex flex-col gap-0.5">
      {sections.map((s) => (
        <li key={s.index}>
          <a href={`#${anchorOf(s.index)}`} className="block rounded-md px-2.5 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-foreground">
            {s.title}
          </a>
        </li>
      ))}
    </ul>
  )

  return (
    <div className="container py-10">
      <Breadcrumb
        className="mb-6"
        items={
          home === "about"
            ? [{ label: "Home", href: "/" }, { label: doc.title }]
            : [{ label: "Home", href: "/" }, { label: "Legal", href: "/legal" }, { label: doc.title }]
        }
      />
      <div className={sections.length > 1 ? "grid items-start gap-10 lg:grid-cols-[240px_minmax(0,1fr)]" : undefined}>
        {sections.length > 1 && (
          <aside className="sticky top-36 max-lg:hidden">
            <nav aria-label="On this page">
              <p className="mb-2 px-2.5 text-xs font-medium tracking-wider text-muted-foreground uppercase">On this page</p>
              {contents}
            </nav>
          </aside>
        )}
        <article className="max-w-[760px] min-w-0 space-y-8">
          <header className="space-y-3">
            <h1 className="text-3xl font-semibold tracking-tight">{doc.title}</h1>
            <p className="text-sm text-muted-foreground">
              Version {((shown ?? doc.versions[0])?.version ?? doc.currentVersion).replace(/^v/, "")} · Effective{" "}
              {formatDate(shown?.effectiveDate ?? doc.effectiveDate)} ·{" "}
              <Link href={`/legal/${doc.slug}/versions`} className="underline underline-offset-2">
                Version history
              </Link>
            </p>
          </header>

          {superseded && (
            <Alert variant="default" title="This is an earlier version">
              It is no longer in force.{" "}
              <Link href={`/legal/${doc.slug}`} className="underline underline-offset-2">
                Read the current version
              </Link>
              .
            </Alert>
          )}

          {sections.length > 1 && (
            <details className="group rounded-lg border lg:hidden">
              <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-sm font-medium [&::-webkit-details-marker]:hidden">
                On this page
                <ChevronDown aria-hidden="true" className="size-4 transition-transform group-open:rotate-180" />
              </summary>
              <nav aria-label="On this page" className="border-t p-2">
                {contents}
              </nav>
            </details>
          )}

          <div className="space-y-4 leading-[1.7] text-muted-foreground">
            {blocks.map((block, i) => (
              <BlockView key={i} block={block} id={block.kind === "heading" && block.level === 2 ? anchorOf(i) : undefined} />
            ))}
          </div>
        </article>
      </div>
    </div>
  )
}

/** A document's text on its own — for a page that frames it differently (About). */
export function LegalBody({ slug }: { slug: string }) {
  return (
    <div className="space-y-4 leading-[1.7] text-muted-foreground">
      {parseMarkdown(getDocument(slug).body).map((block, i) => (
        <BlockView key={i} block={block} />
      ))}
    </div>
  )
}

function BlockView({ block, id }: { block: Block; id?: string }) {
  switch (block.kind) {
    case "heading": {
      const cls =
        block.level === 1
          ? "pt-6 text-2xl font-semibold tracking-tight text-foreground"
          : block.level === 2
            ? "scroll-mt-40 pt-4 text-xl font-semibold tracking-tight text-foreground"
            : "pt-2 text-base font-medium text-foreground"
      if (block.level === 2) return <h2 id={id} className={cls}><Inline runs={block.runs} /></h2>
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
                  <th key={i} className="border-b px-3 py-2 font-medium text-foreground">
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
        if (run.bold) node = <strong className="font-semibold text-foreground">{node}</strong>
        else if (run.italic) node = <em>{node}</em>
        if (run.href) {
          const internal = run.href.startsWith("/")
          node = internal ? (
            <Link href={run.href} className="text-foreground underline underline-offset-2">
              {node}
            </Link>
          ) : (
            <a href={run.href} className="text-foreground underline underline-offset-2" target="_blank" rel="noopener noreferrer">
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
