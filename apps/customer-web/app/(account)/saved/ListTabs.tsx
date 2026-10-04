"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useRef, useState } from "react"

import { LIST_NAME_MAX, type SavedListDTO } from "@effy/shared-types"

import { btnClass } from "@/components/storefront/actions"
import { createList, deleteList, listLabel, nameRemaining, refusalText, renameList } from "@/lib/list-actions"

const href = (list: SavedListDTO) => (list.isDefault ? "/saved" : `/saved/${list.id}`)

/**
 * The shopper's lists, in one place (068 FR-027): "Saved" first, each with its count.
 *
 * ⚠ TABS OVER ONE LIST OF ROWS, not a grid of list cards (Principle V). The row scrolls sideways
 * rather than wrapping, so twenty lists stay one line on a phone.
 */
export function ListTabs({ lists, currentId }: { lists: SavedListDTO[]; currentId: string }) {
  const current = lists.find((l) => l.id === currentId)

  return (
    <div className="mb-6">
      <div className="flex items-center gap-3 border-b">
        <nav aria-label="Your lists" className="-mb-px flex min-w-0 flex-1 gap-1 overflow-x-auto">
          {lists.map((list) => {
            const selected = list.id === currentId
            return (
              <Link
                key={list.id}
                href={href(list)}
                aria-current={selected ? "page" : undefined}
                className={`shrink-0 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm ${
                  selected
                    ? "border-primary font-medium text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                {/* Plain text: a list name is the shopper's own and is never interpreted. */}
                {listLabel(list)} <span className="text-muted-foreground">({list.count})</span>
              </Link>
            )
          })}
        </nav>
        <NewList />
      </div>

      {/* "Saved" offers neither: it cannot be renamed or deleted (FR-003). */}
      {current && !current.isDefault && <ManageList list={current} />}
    </div>
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
  return (
    <>
      <input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete="off"
        aria-invalid={error !== null || remaining < 0}
        aria-describedby={`${id}-hint`}
        className="mt-2 h-10 w-full rounded-md border border-input bg-card px-3 text-sm outline-none focus-visible:border-ring aria-invalid:border-destructive"
      />
      <p id={`${id}-hint`} className="mt-1 text-xs text-muted-foreground">
        {error ? (
          <span role="alert" className="text-destructive">
            {error}
          </span>
        ) : remaining < 0 ? (
          `${-remaining} too many characters`
        ) : (
          `${remaining} characters left`
        )}
      </p>
    </>
  )
}

const dialogClass =
  "fx-dialog fx-dialog-modal m-auto w-[min(24rem,92vw)] rounded-xl border bg-card p-5 text-foreground shadow-lg backdrop:bg-black/50"

function NewList() {
  const router = useRouter()
  const ref = useRef<HTMLDialogElement>(null)
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
    ref.current?.close()
    setName("")
    router.push(`/saved/${result.value.id}`)
    router.refresh()
  }

  return (
    <>
      <button type="button" onClick={() => ref.current?.showModal()} className={btnClass("outline", "sm", "mb-1 shrink-0")}>
        New list
      </button>
      <dialog ref={ref} aria-labelledby="new-list-title" className={dialogClass}>
        <form onSubmit={submit}>
          <h2 id="new-list-title" className="text-base font-semibold">
            New list
          </h2>
          <label htmlFor="new-list-name" className="mt-3 block text-sm">
            Name
          </label>
          <NameField id="new-list-name" value={name} onChange={setName} error={error} />
          <div className="mt-4 flex justify-end gap-2">
            <button type="button" onClick={() => ref.current?.close()} className={btnClass("muted", "md")}>
              Cancel
            </button>
            <button type="submit" disabled={busy || nameRemaining(name, LIST_NAME_MAX) < 0} className={btnClass("primary", "md")}>
              Create
            </button>
          </div>
        </form>
      </dialog>
    </>
  )
}

function ManageList({ list }: { list: SavedListDTO }) {
  const router = useRouter()
  const renameRef = useRef<HTMLDialogElement>(null)
  const deleteRef = useRef<HTMLDialogElement>(null)
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
    renameRef.current?.close()
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
    <div className="mt-3 flex gap-4 text-sm">
      <button type="button" onClick={() => renameRef.current?.showModal()} className="text-muted-foreground hover:underline">
        Rename list
      </button>
      <button type="button" onClick={() => deleteRef.current?.showModal()} className="text-muted-foreground hover:underline">
        Delete list
      </button>

      <dialog ref={renameRef} aria-labelledby="rename-list-title" className={dialogClass}>
        <form onSubmit={rename}>
          <h2 id="rename-list-title" className="text-base font-semibold">
            Rename list
          </h2>
          <label htmlFor="rename-list-name" className="mt-3 block text-sm">
            Name
          </label>
          <NameField id="rename-list-name" value={name} onChange={setName} error={error} />
          <div className="mt-4 flex justify-end gap-2">
            <button type="button" onClick={() => renameRef.current?.close()} className={btnClass("muted", "md")}>
              Cancel
            </button>
            <button type="submit" disabled={busy || nameRemaining(name, LIST_NAME_MAX) < 0} className={btnClass("primary", "md")}>
              Save
            </button>
          </div>
        </form>
      </dialog>

      <dialog ref={deleteRef} aria-labelledby="delete-list-title" className={dialogClass}>
        <h2 id="delete-list-title" className="text-base font-semibold">
          Delete "{listLabel(list)}"?
        </h2>
        {/* ⚠ FR-006: BOTH numbers. What is in the list, and how much of it lives nowhere else — the
            second is what the shopper actually loses, and the delete un-saves exactly that many. */}
        <p className="mt-2 text-sm">{deleteSummary(list)}</p>
        {error && (
          <p role="alert" className="mt-2 text-sm text-destructive">
            {error}
          </p>
        )}
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={() => deleteRef.current?.close()} className={btnClass("muted", "md")}>
            Cancel
          </button>
          <button type="button" onClick={remove} disabled={busy} className={btnClass("destructive", "md")}>
            Delete list
          </button>
        </div>
      </dialog>
    </div>
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
