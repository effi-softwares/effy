import { useMemo, useState, type DragEvent } from "react"

import { ArrowDown, ArrowUp, ChevronRight, FolderInput, Plus } from "lucide-react"

import { cn } from "@effy/design-system"
import { Button } from "@effy/design-system/ui"
import { CategoryGlyph } from "@effy/web-kit/category-icon"

import { canAddChild, dropRefusal, index, type Category, type TreeNode, buildTree } from "./model"

interface Props {
  categories: Category[]
  selectedId: string | null
  canManage: boolean
  onSelect: (id: string) => void
  onAdd: (parentId: string | null) => void
  onMoveTo: (id: string) => void
  /** Re-parent and/or reorder: `position` is the place among the new siblings. */
  onMove: (id: string, parentId: string | null, position: number) => void
}

/**
 * The category tree: an indented list, departments first. Drag a row onto another to file it beneath;
 * targets the server would refuse do not accept the drop. Up/down and "Move to…" do the same from the
 * keyboard or a touch screen.
 */
export function CategoryTree({ categories, selectedId, canManage, onSelect, onAdd, onMoveTo, onMove }: Props) {
  const roots = useMemo(() => buildTree(categories), [categories])
  const byId = useMemo(() => index(categories), [categories])
  const [open, setOpen] = useState<Set<string>>(() => new Set())
  const [dragId, setDragId] = useState<string | null>(null)
  const [overId, setOverId] = useState<string | null | "root">(null)

  // The selected row's ancestors are always open.
  const opened = useMemo(() => {
    const s = new Set(open)
    for (let c = selectedId ? byId.get(selectedId) : undefined; c?.parentId; c = byId.get(c.parentId)) s.add(c.parentId)
    return s
  }, [open, selectedId, byId])

  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const accepts = (parentId: string | null) => dragId !== null && dropRefusal(dragId, parentId, categories) === null

  function dropOn(e: DragEvent, parentId: string | null) {
    e.preventDefault()
    const id = dragId
    setDragId(null)
    setOverId(null)
    if (!id || !accepts(parentId)) return
    const siblings = categories.filter((c) => c.parentId === parentId && c.id !== id)
    onMove(id, parentId, siblings.length)
    if (parentId) setOpen((prev) => new Set(prev).add(parentId))
  }

  function row(node: TreeNode, siblings: TreeNode[], place: number) {
    const c = node.category
    const retired = c.status === "retired"
    const hasKids = node.children.length > 0
    const isOpen = opened.has(c.id)
    const selected = c.id === selectedId
    const target = overId === c.id
    return (
      <li
        key={c.id}
        role="treeitem"
        aria-expanded={hasKids ? isOpen : undefined}
        aria-selected={selected}
        aria-level={node.depth}
      >
        <div
          className={cn(
            "group flex min-h-11 items-center gap-1 rounded-md pr-1 text-sm",
            selected ? "bg-muted" : "hover:bg-muted/60",
            target && "ring-2 ring-primary ring-inset",
          )}
          style={{ paddingLeft: `${(node.depth - 1) * 20 + 4}px` }}
          draggable={canManage && !retired}
          onDragStart={(e) => {
            setDragId(c.id)
            e.dataTransfer.effectAllowed = "move"
            e.dataTransfer.setData("text/plain", c.id)
          }}
          onDragEnd={() => {
            setDragId(null)
            setOverId(null)
          }}
          onDragOver={(e) => {
            if (!accepts(c.id)) return
            e.preventDefault()
            e.dataTransfer.dropEffect = "move"
            if (overId !== c.id) setOverId(c.id)
          }}
          onDragLeave={() => overId === c.id && setOverId(null)}
          onDrop={(e) => dropOn(e, c.id)}
        >
          <button
            type="button"
            className={cn(
              "grid size-7 shrink-0 place-items-center rounded text-muted-foreground",
              !hasKids && "invisible",
            )}
            aria-label={isOpen ? `Collapse ${c.name}` : `Expand ${c.name}`}
            onClick={() => toggle(c.id)}
            tabIndex={hasKids ? 0 : -1}
          >
            <ChevronRight className={cn("size-4 transition-transform", isOpen && "rotate-90")} />
          </button>
          <button
            type="button"
            className="flex min-w-0 flex-1 items-center gap-2 py-2 text-left"
            onClick={() => onSelect(c.id)}
            aria-current={selected ? "true" : undefined}
          >
            <CategoryGlyph icon={c.icon} className="size-4 shrink-0 text-muted-foreground" />
            <span className={cn("truncate", retired && "text-muted-foreground line-through")}>{c.name}</span>
            {retired ? <span className="text-xs text-muted-foreground">Retired</span> : null}
            <span className="ml-auto pl-2 text-xs tabular-nums text-muted-foreground">
              {c.productCount > 0 ? c.productCount : ""}
            </span>
          </button>
          {canManage && !retired ? (
            <div
              className={cn("flex items-center", selected ? "flex" : "hidden group-focus-within:flex group-hover:flex")}
            >
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="size-8"
                aria-label={`Move ${c.name} up`}
                disabled={place === 0}
                onClick={() => onMove(c.id, c.parentId, place - 1)}
              >
                <ArrowUp />
              </Button>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="size-8"
                aria-label={`Move ${c.name} down`}
                disabled={place === siblings.length - 1}
                onClick={() => onMove(c.id, c.parentId, place + 1)}
              >
                <ArrowDown />
              </Button>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="size-8"
                aria-label={`Move ${c.name} to…`}
                onClick={() => onMoveTo(c.id)}
              >
                <FolderInput />
              </Button>
              {canAddChild(c.id, byId) ? (
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="size-8"
                  aria-label={`Add a sub-category to ${c.name}`}
                  onClick={() => onAdd(c.id)}
                >
                  <Plus />
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
        {hasKids && isOpen ? level(node.children) : null}
      </li>
    )
  }

  // Render functions, not components: a component declared in here would remount every row on each render.
  function level(nodes: TreeNode[], root = false) {
    return (
      <ul role={root ? "tree" : "group"} aria-label={root ? "Categories" : undefined} className="space-y-0.5">
        {nodes.map((n, i) => row(n, nodes, i))}
      </ul>
    )
  }

  return (
    <div className="space-y-2">
      {canManage ? (
        <div
          className={cn(
            "flex items-center justify-between gap-2 rounded-md border border-dashed border-transparent px-1 py-1",
            dragId && accepts(null) && "border-border",
            overId === "root" && "border-primary",
          )}
          onDragOver={(e) => {
            if (!accepts(null)) return
            e.preventDefault()
            setOverId("root")
          }}
          onDragLeave={() => overId === "root" && setOverId(null)}
          onDrop={(e) => dropOn(e, null)}
        >
          <span className="text-xs text-muted-foreground">
            {dragId ? "Drop here to make it a department" : `${roots.length} departments`}
          </span>
          <Button type="button" size="sm" variant="outline" onClick={() => onAdd(null)}>
            <Plus />
            Add department
          </Button>
        </div>
      ) : null}
      {level(roots, true)}
    </div>
  )
}
