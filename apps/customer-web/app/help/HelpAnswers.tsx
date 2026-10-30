"use client"

import Link from "next/link"
import { useMemo, useState } from "react"
import { ChevronDown, Search } from "lucide-react"

import { HELP_ANSWERS, HELP_TOPICS } from "./answers"

/**
 * The answers, grouped by topic, with a search that narrows them on the page.
 *
 * No request is made: the answers are content shipped with the page, so searching is filtering.
 * Each answer is a native `<details>` - it opens without script, and every answer is in the HTML for
 * a crawler and for find-in-page.
 *
 * A search with no match says so and points at the message form, which is always below.
 */
export function HelpAnswers() {
  const [query, setQuery] = useState("")
  const q = query.trim().toLowerCase()

  const matches = useMemo(
    () =>
      q
        ? HELP_ANSWERS.filter((a) => `${a.question} ${a.answer} ${a.topic}`.toLowerCase().includes(q))
        : HELP_ANSWERS,
    [q],
  )

  return (
    <div>
      <label className="flex h-11 max-w-xl items-center gap-2 rounded-md border border-input bg-background px-3 shadow-xs focus-within:border-ring">
        <Search aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
        <span className="sr-only">Search help</span>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search help"
          className="h-full min-w-0 flex-1 border-0 bg-transparent text-base outline-none placeholder:text-muted-foreground md:text-sm"
        />
      </label>

      <p role="status" aria-live="polite" className="sr-only">
        {q ? `${matches.length} ${matches.length === 1 ? "answer" : "answers"}` : ""}
      </p>

      {matches.length === 0 ? (
        <p className="mt-8 rounded-lg bg-muted p-4 text-sm">
          No answer matches “{query.trim()}”.{" "}
          <a href="#message" className="font-medium text-primary underline underline-offset-4">
            Send us a message
          </a>{" "}
          and we&rsquo;ll reply by email.
        </p>
      ) : (
        <div className="mt-8 grid gap-x-12 gap-y-8 lg:grid-cols-2">
          {HELP_TOPICS.map((topic) => {
            const answers = matches.filter((a) => a.topic === topic)
            if (answers.length === 0) return null
            return (
              <section key={topic}>
                <h2 className="text-lg font-semibold">{topic}</h2>
                <div className="mt-2 divide-y border-y">
                  {answers.map((a) => (
                    <details key={a.id} className="group" open={q ? true : undefined}>
                      <summary className="flex min-h-12 list-none items-center justify-between gap-4 py-3 text-sm font-medium [&::-webkit-details-marker]:hidden">
                        {a.question}
                        <ChevronDown
                          aria-hidden="true"
                          className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180"
                        />
                      </summary>
                      <div className="pb-4 text-sm leading-relaxed text-muted-foreground">
                        <p>{a.answer}</p>
                        {a.link && (
                          <Link href={a.link.href} className="mt-2 inline-block font-medium text-primary underline underline-offset-4">
                            {a.link.label}
                          </Link>
                        )}
                      </div>
                    </details>
                  ))}
                </div>
              </section>
            )
          })}
        </div>
      )}
    </div>
  )
}
