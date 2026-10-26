import { useMemo, useState } from "react"

import { useQuery } from "@tanstack/react-query"
import { X } from "lucide-react"

import { Button, Input } from "@effy/design-system/ui"
import { PLACEMENTS_MAX } from "@effy/shared-types"
import { Panel } from "@effy/web-kit/patterns"

import { taxonomyErrorText } from "@/features/taxonomy/errorText"
import { leavesWithPaths, pathText } from "@/features/taxonomy/model"
import { treeQuery } from "@/features/taxonomy/queries"

import { useSetPlacements } from "./queries"

/**
 * "Also shown in": up to five extra leaves a product is browsed under (101). Effy's choice, never the
 * shop's; the product's own category still decides its form.
 */
export function Placements({
  productId,
  homePath,
  placements,
  canDecide,
}: {
  productId: string
  homePath: string[]
  placements: { categoryId: string; path: string[] }[]
  canDecide: boolean
}) {
  const save = useSetPlacements(productId)
  const tree = useQuery({ ...treeQuery(), enabled: canDecide })
  const [q, setQ] = useState("")
  const [error, setError] = useState<string | null>(null)
  const chosen = placements.map((p) => p.categoryId)
  const home = pathText(homePath)

  const matches = useMemo(() => {
    const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean)
    if (words.length === 0) return []
    return leavesWithPaths(tree.data ?? [])
      .filter((l) => !chosen.includes(l.id) && pathText(l.path) !== home)
      .filter((l) => words.every((w) => pathText(l.path).toLowerCase().includes(w)))
      .slice(0, 8)
  }, [q, tree.data, chosen, home])

  function replace(ids: string[]) {
    setError(null)
    save.mutate(ids, { onError: (err) => setError(taxonomyErrorText(err)) })
  }

  return (
    <Panel
      title="Also shown in"
      description="Extra categories shoppers find it under. Its own category still decides its details."
    >
      <div className="space-y-3">
        <ul className="space-y-1.5">
          {placements.map((p) => (
            <li key={p.categoryId} className="flex items-center justify-between gap-2 text-sm">
              <span>{pathText(p.path)}</span>
              {canDecide ? (
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  aria-label={`Remove ${p.path[p.path.length - 1]}`}
                  disabled={save.isPending}
                  onClick={() => replace(chosen.filter((id) => id !== p.categoryId))}
                >
                  <X />
                </Button>
              ) : null}
            </li>
          ))}
          {placements.length === 0 ? <li className="text-sm text-muted-foreground">Only its own category.</li> : null}
        </ul>
        {canDecide && placements.length < PLACEMENTS_MAX ? (
          <div className="space-y-2">
            <Input
              aria-label="Find a category to add"
              placeholder="Add a category…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            {matches.length > 0 ? (
              <ul className="divide-y divide-border rounded-md border border-border">
                {matches.map((l) => (
                  <li key={l.id}>
                    <button
                      type="button"
                      className="w-full px-3 py-2 text-left text-sm hover:bg-muted"
                      disabled={save.isPending}
                      onClick={() => {
                        setQ("")
                        replace([...chosen, l.id])
                      }}
                    >
                      {pathText(l.path)}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
      </div>
    </Panel>
  )
}
