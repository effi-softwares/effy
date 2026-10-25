"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { Pencil, Plus, Trash2 } from "lucide-react"

import { LIST_NAME_MAX, type SavedListDTO } from "@effy/shared-types"

import { btnClass } from "@/components/storefront/actions"
import { Field, input } from "@/components/storefront/kit"
import { Button } from "@/components/ui/button"
import { Dialog } from "@/components/ui/dialog"
import { createList, deleteList, listLabel, nameRemaining, refusalText, renameList } from "@/lib/list-actions"

const href = (list: SavedListDTO) => (list.isDefault ? "/saved" : `/saved/${list.id}`)

/**
 * The head of every saved-items page: which list, what is in it, its actions, and the shopper's lists as
 * a row of tabs ("Saved" first, each with its count) that scrolls sideways rather than wrapping.
 */
export function ListTabs({
  lists,
  currentId,
  droppedCount = 0,
}: {
  lists: SavedListDTO[]
  currentId: string
  /** How many of this list's items cost less than when they were saved. */
  droppedCount?: number
}) {
  const current = lists.find((l) => l.id === currentId)
  const count = current?.count ?? 0

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          {/* Plain text: a list name is the shopper's own and is never interpreted. */}
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            {current && !current.isDefault ? listLabel(current) : "Saved items"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {count === 1 ? "1 item" : `${count} items`}
            {droppedCount > 0 && ` · ${droppedCount} dropped in price`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {/* "Saved" cannot be renamed or deleted. */}
          {current && !current.isDefault && <ManageList list={current} />}
          <NewList />
        </div>
      </div>

      <nav aria-label="Your lists" className="flex gap-2 overflow-x-auto [scrollbar-width:none]">
        {lists.map((list) => {
          const selected = list.id === currentId
          return (
            <Link
              key={list.id}
              href={href(list)}
              aria-current={selected ? "page" : undefined}
              className={btnClass(selected ? "muted" : "ghost", "sm")}
            >
              {listLabel(list)}{" "}
              <span className="font-normal text-muted-foreground">{list.count}</span>
            </Link>
          )
        })}
      </nav>
    </>
  )
}

function NameField({
  id,
  value,
  onChange,
  error,
}: {
  id: string
  value: string
  onChange: (v: string) => void
  error: string | null
}) {
  const remaining = nameRemaining(value, LIST_NAME_MAX)
  const tooLong = remaining < 0
  return (
    <Field
      label="Name"
      htmlFor={id}
      error={error ?? (tooLong ? `${-remaining} too many characters` : null)}
      hint={`${remaining} characters left`}
    >
      <input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete="off"
        aria-invalid={error !== null || tooLong || undefined}
        className={input}
      />
    </Field>
  )
}

function NewList() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    setError(null)
    const result = await createList(name)
    setBusy(false)
    if (!result.ok) {
      setError(refusalText(result.reason))
      return
    }
    setOpen(false)
    setName("")
    router.push(`/saved/${result.value.id}`)
    router.refresh()
  }

  return (
    <>
      <Button type="button" onClick={() => setOpen(true)}>
        <Plus aria-hidden="true" />
        New list
      </Button>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title="New list"
        description="Group items you buy together, like a weekly shop."
        footer={
          <>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" form="new-list-form" disabled={busy || nameRemaining(name, LIST_NAME_MAX) < 0}>
              Create
            </Button>
          </>
        }
      >
        <form id="new-list-form" onSubmit={submit}>
          <NameField id="new-list-name" value={name} onChange={setName} error={error} />
        </form>
      </Dialog>
    </>
  )
}

function ManageList({ list }: { list: SavedListDTO }) {
  const router = useRouter()
  const [renameOpen, setRenameOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [name, setName] = useState(list.name ?? "")
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function rename(e: React.FormEvent) {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    setError(null)
    const result = await renameList(list.id, name)
    setBusy(false)
    if (!result.ok) {
      setError(refusalText(result.reason))
      return
    }
    setRenameOpen(false)
    router.refresh()
  }

  async function remove() {
    if (busy) return
    setBusy(true)
    const result = await deleteList(list.id)
    setBusy(false)
    if (!result.ok) {
      setError(refusalText(result.reason))
      return
    }
    router.push("/saved")
    router.refresh()
  }

  return (
    <>
      <Button type="button" variant="outline" onClick={() => setRenameOpen(true)}>
        <Pencil aria-hidden="true" />
        Rename
      </Button>
      <Button type="button" variant="outline" onClick={() => setDeleteOpen(true)}>
        <Trash2 aria-hidden="true" />
        Delete list
      </Button>

      <Dialog
        open={renameOpen}
        onOpenChange={setRenameOpen}
        title="Rename list"
        footer={
          <>
            <Button type="button" variant="outline" onClick={() => setRenameOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" form="rename-list-form" disabled={busy || nameRemaining(name, LIST_NAME_MAX) < 0}>
              Save
            </Button>
          </>
        }
      >
        <form id="rename-list-form" onSubmit={rename}>
          <NameField id="rename-list-name" value={name} onChange={setName} error={error} />
        </form>
      </Dialog>

      <Dialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        alert
        title={`Delete "${listLabel(list)}"?`}
        // Both numbers: what is in the list, and how much lives nowhere else (the delete un-saves exactly that).
        description={deleteSummary(list)}
        footer={
          <>
            <Button type="button" variant="outline" onClick={() => setDeleteOpen(false)}>
              Cancel
            </Button>
            <Button type="button" variant="destructive" onClick={remove} disabled={busy}>
              Delete list
            </Button>
          </>
        }
      >
        {error && (
          <p role="alert" className="text-sm font-medium text-destructive">
            {error}
          </p>
        )}
      </Dialog>
    </>
  )
}

/** What deleting a list costs, in the shopper's terms. Exported for its test. */
export function deleteSummary(list: Pick<SavedListDTO, "count" | "onlyHereCount">): string {
  if (list.count === 0) return "This list is empty."
  const items = list.count === 1 ? "1 item" : `${list.count} items`
  if (list.onlyHereCount === 0) {
    return `This list has ${items}. All of them are in another list too, so they stay saved.`
  }
  const lost =
    list.onlyHereCount === 1
      ? "1 of them isn't in any other list and will no longer be saved."
      : `${list.onlyHereCount} of them aren't in any other list and will no longer be saved.`
  return `This list has ${items}. ${lost}`
}
