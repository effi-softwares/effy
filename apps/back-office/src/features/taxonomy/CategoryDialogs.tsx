import { useMemo, useState } from "react"

import { CATEGORY_NAME_MAX } from "@effy/shared-types"
import {
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
} from "@effy/design-system/ui"

import { track } from "@/lib/telemetry"

import { refusalCode, taxonomyErrorText } from "./errorText"
import { depthOf, dropRefusal, index, isLeaf, pathOf, pathText, type Category } from "./model"
import { useCreateCategory, useMoveCategory } from "./queries"

/** Add a department (`parentId` null) or a sub-category. A leaf that holds products asks to move them into it. */
export function AddCategoryDialog({
  parentId,
  categories,
  onClose,
  onCreated,
}: {
  parentId: string | null
  categories: Category[]
  onClose: () => void
  onCreated: (id: string) => void
}) {
  const byId = useMemo(() => index(categories), [categories])
  const parent = parentId ? byId.get(parentId) : undefined
  const holds = parent && isLeaf(parent.id, categories) ? parent.productCount + parent.placementCount : 0
  const [name, setName] = useState("")
  const [consent, setConsent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const create = useCreateCategory()
  const needsConsent = holds > 0

  async function submit() {
    setError(null)
    try {
      const created = await create.mutateAsync({
        parentId,
        name: name.trim(),
        moveProductsToSelf: needsConsent ? consent : undefined,
      })
      track({
        name: "taxonomy_category_created",
        categoryId: created.id,
        depth: parentId ? depthOf(parentId, byId) + 1 : 1,
      })
      onCreated(created.id)
      onClose()
    } catch (err) {
      setError(
        refusalCode(err) === "category_has_products"
          ? "Agree to move this category's products into the new sub-category first."
          : taxonomyErrorText(err),
      )
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{parent ? "Add sub-category" : "Add department"}</DialogTitle>
          <DialogDescription>
            {parent ? `Under ${pathText(pathOf(parent.id, byId))}.` : "A new top-level department."}
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          noValidate
          onSubmit={(e) => {
            e.preventDefault()
            void submit()
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="new-category-name">Name</Label>
            <Input
              id="new-category-name"
              autoFocus
              maxLength={CATEGORY_NAME_MAX}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          {needsConsent ? (
            <div className="space-y-2 rounded-md border border-border p-3 text-sm">
              <p>
                {holds} product{holds === 1 ? " is" : "s are"} filed in {parent!.name}. Products can only sit in a
                category with no sub-categories, so they will move into the new one. Shops are not asked to do anything.
              </p>
              <label className="flex items-center gap-2">
                <Checkbox checked={consent} onCheckedChange={(v) => setConsent(v === true)} />
                Move them into the new sub-category
              </label>
            </div>
          ) : null}
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={create.isPending || name.trim() === "" || (needsConsent && !consent)}>
              Add
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/** "Move to…": the keyboard and touch way to re-parent, listing only the places that would accept it. */
export function MoveCategoryDialog({
  id,
  categories,
  onClose,
}: {
  id: string
  categories: Category[]
  onClose: () => void
}) {
  const byId = useMemo(() => index(categories), [categories])
  const moving = byId.get(id)!
  const [q, setQ] = useState("")
  const [error, setError] = useState<string | null>(null)
  const move = useMoveCategory()

  const places = useMemo(() => {
    const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean)
    const candidates: { parentId: string | null; label: string }[] = [
      ...(dropRefusal(id, null, categories) === null && moving.parentId !== null
        ? [{ parentId: null, label: "Top level (a department)" }]
        : []),
      ...categories
        .filter((c) => c.id !== moving.parentId && dropRefusal(id, c.id, categories) === null)
        .map((c) => ({ parentId: c.id, label: pathText(pathOf(c.id, byId)) }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    ]
    return candidates.filter((p) => words.every((w) => p.label.toLowerCase().includes(w))).slice(0, 100)
  }, [q, id, categories, moving.parentId, byId])

  async function choose(parentId: string | null) {
    setError(null)
    try {
      const siblings = categories.filter((c) => c.parentId === parentId && c.id !== id)
      await move.mutateAsync({ id, body: { parentId, position: siblings.length } })
      onClose()
    } catch (err) {
      setError(taxonomyErrorText(err))
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Move {moving.name}</DialogTitle>
          <DialogDescription>
            Its sub-categories move with it. Only places within five levels are listed.
          </DialogDescription>
        </DialogHeader>
        <Input
          aria-label="Find a category"
          placeholder="Find a category…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          autoFocus
        />
        <ul className="max-h-80 divide-y overflow-y-auto rounded-lg border">
          {places.map((p) => (
            <li key={p.parentId ?? "root"}>
              <Button
                type="button"
                variant="ghost"
                className="w-full justify-start rounded-none font-normal"
                disabled={move.isPending}
                onClick={() => void choose(p.parentId)}
              >
                {p.label}
              </Button>
            </li>
          ))}
          {places.length === 0 ? (
            <li className="px-3 py-2.5 text-sm text-muted-foreground">No category matches.</li>
          ) : null}
        </ul>
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
