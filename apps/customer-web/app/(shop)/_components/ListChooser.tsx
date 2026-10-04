"use client"

import { useEffect, useRef, useState } from "react"
import { createRoot } from "react-dom/client"

import { LIST_NAME_MAX, type SavedListDTO } from "@effy/shared-types"

import { btnClass } from "@/components/storefront/actions"
import {
  addToList,
  createList,
  fetchLists,
  listLabel,
  nameRemaining,
  refusalText,
  removeFromList,
} from "@/lib/list-actions"

/**
 * The list chooser (068): which of the shopper's lists a product is in, with a tick box for each
 * and a way to make a new one.
 *
 * ⚠ THIS MODULE IS ONLY EVER REACHED THROUGH `import()`. The heart is on the guest path and `/` had
 * 0.3 KB of budget left; nothing here may be imported statically from a guest route.
 *
 * ⚠ A NATIVE `<dialog>`, not a dialog library, for the reason `MiniCart` records: the library costs
 * more than the route's whole headroom. `showModal()` gives the focus trap, Escape, the backdrop,
 * and returns focus to the control that opened it.
 *
 * Checkbox rows, not cards (Principle V).
 */
export function openListChooser(productId: string, onClose?: () => void): void {
  const host = document.createElement("div")
  document.body.appendChild(host)
  const root = createRoot(host)
  root.render(
    <ListChooser
      productId={productId}
      onClosed={() => {
        root.unmount()
        host.remove()
        onClose?.()
      }}
    />,
  )
}

type State =
  | { phase: "loading" }
  | { phase: "guest" }
  | { phase: "failed" }
  | { phase: "ready"; lists: SavedListDTO[] }

export function ListChooser({ productId, onClosed }: { productId: string; onClosed: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [state, setState] = useState<State>({ phase: "loading" })
  const [pending, setPending] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [name, setName] = useState("")
  const [nameError, setNameError] = useState<string | null>(null)

  async function load() {
    const result = await fetchLists(productId)
    if (result.ok) setState({ phase: "ready", lists: result.value })
    // ⚠ 401 is "you are a guest", not a failure (FR-037). Their save already happened, on this device.
    else setState({ phase: result.reason === "guest" ? "guest" : "failed" })
  }

  useEffect(() => {
    dialogRef.current?.showModal()
    void load()
    // Loaded once, when the chooser opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function toggle(list: SavedListDTO) {
    if (pending) return
    setPending(list.id)
    setError(null)
    const result = list.containsProduct
      ? await removeFromList(list.id, productId)
      : await addToList(list.id, productId)
    if (!result.ok) setError(refusalText(result.reason))
    // Re-read rather than flip locally: a list deleted on another device must disappear, and the
    // counts belong to the platform.
    await load()
    setPending(null)
  }

  async function create(e: React.FormEvent) {
    e.preventDefault()
    if (pending) return
    setPending("new")
    setNameError(null)
    const result = await createList(name, productId)
    if (result.ok) {
      setName("")
      await load()
    } else {
      setNameError(refusalText(result.reason))
    }
    setPending(null)
  }

  const remaining = nameRemaining(name, LIST_NAME_MAX)

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="list-chooser-title"
      className="fx-dialog fx-dialog-modal m-auto w-[min(24rem,92vw)] rounded-xl border bg-card p-0 text-foreground shadow-lg backdrop:bg-black/50"
      onClose={onClosed}
      onClick={(e) => {
        if (e.target === e.currentTarget) dialogRef.current?.close()
      }}
    >
      <div className="flex items-center justify-between border-b px-5 py-4">
        <h2 id="list-chooser-title" className="text-base font-semibold">
          Add to a list
        </h2>
        <button
          type="button"
          onClick={() => dialogRef.current?.close()}
          className="rounded-md px-2 py-1 text-sm text-muted-foreground hover:bg-accent"
        >
          Done
        </button>
      </div>

      <div className="px-5 py-4">
        {state.phase === "loading" && <p className="text-sm text-muted-foreground">Loading your lists…</p>}

        {state.phase === "failed" && (
          <p role="alert" className="text-sm">
            We couldn't load your lists. Close this and try again.
          </p>
        )}

        {state.phase === "guest" && (
          <div className="text-sm">
            <p>
              Lists like "Weekly Items" need an account. This item is saved on this device and will
              join your saved items when you sign in.
            </p>
            <a
              href={`/sign-in?next=${encodeURIComponent(window.location.pathname + window.location.search)}`}
              className={btnClass("primary", "md", "mt-4")}
            >
              Sign in
            </a>
          </div>
        )}

        {state.phase === "ready" && (
          <>
            <ul className="divide-y">
              {state.lists.map((list) => (
                <li key={list.id}>
                  <label className="flex min-h-11 cursor-pointer items-center gap-3 py-2 text-sm">
                    <input
                      type="checkbox"
                      className="size-4 rounded-sm"
                      checked={Boolean(list.containsProduct)}
                      disabled={pending !== null}
                      onChange={() => void toggle(list)}
                    />
                    {/* Plain text. A list name is the shopper's own and is never interpreted. */}
                    <span className="min-w-0 flex-1 truncate">{listLabel(list)}</span>
                    <span className="text-muted-foreground">{list.count}</span>
                  </label>
                </li>
              ))}
            </ul>

            {error && (
              <p role="alert" className="mt-3 text-sm text-destructive">
                {error}
              </p>
            )}

            <form onSubmit={create} className="mt-4 border-t pt-4">
              <label htmlFor="list-chooser-name" className="text-sm font-medium">
                New list
              </label>
              <div className="mt-2 flex gap-2">
                <input
                  id="list-chooser-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Weekly Items"
                  autoComplete="off"
                  aria-invalid={nameError !== null || remaining < 0}
                  aria-describedby="list-chooser-name-hint"
                  className="h-10 min-w-0 flex-1 rounded-md border border-input bg-card px-3 text-sm outline-none focus-visible:border-ring aria-invalid:border-destructive"
                />
                <button
                  type="submit"
                  disabled={pending !== null || remaining < 0 || remaining === LIST_NAME_MAX}
                  className={btnClass("outline", "md")}
                >
                  Create
                </button>
              </div>
              <p id="list-chooser-name-hint" className="mt-1 text-xs text-muted-foreground">
                {nameError ? (
                  <span role="alert" className="text-destructive">
                    {nameError}
                  </span>
                ) : remaining < 0 ? (
                  `${-remaining} too many characters`
                ) : (
                  `${remaining} characters left`
                )}
              </p>
            </form>
          </>
        )}
      </div>
    </dialog>
  )
}
