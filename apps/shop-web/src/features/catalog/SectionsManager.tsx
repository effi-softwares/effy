import { useState } from "react";

import { useQuery } from "@tanstack/react-query";
import { Check, Pencil, Plus, Trash2, X } from "lucide-react";

import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Input,
} from "@effy/design-system/ui";
import { ErrorState } from "@effy/web-kit/console";

import { productMutationError } from "./errorText";
import {
  sectionsQuery,
  useCreateSection,
  useDeleteSection,
  useUpdateSection,
} from "./queries";

/**
 * Shop-local sections CRUD (US5 T071): list, create, rename, delete. Opened as a `Dialog` from the
 * catalog list. No cards — a plain divided list with inline rename (DOCTRINE-2). Deleting a section
 * unassigns its products via cascade (handled server-side; the mutation invalidates the product lists).
 */
export function SectionsManager({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const sections = useQuery(sectionsQuery);
  const create = useCreateSection();
  const update = useUpdateSection();
  const remove = useDeleteSection();

  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const busy = create.isPending || update.isPending || remove.isPending;

  function add() {
    const name = newName.trim();
    if (!name) return;
    setError(null);
    create.mutate(
      { name },
      {
        onSuccess: () => setNewName(""),
        onError: (err) => setError(productMutationError(err, "That section name is already used.")),
      },
    );
  }

  function saveEdit() {
    const name = editName.trim();
    if (!editingId || !name) return;
    setError(null);
    update.mutate(
      { id: editingId, body: { name } },
      {
        onSuccess: () => setEditingId(null),
        onError: (err) => setError(productMutationError(err, "That section name is already used.")),
      },
    );
  }

  function del(id: string) {
    setError(null);
    remove.mutate(id, { onError: (err) => setError(productMutationError(err)) });
  }

  const list = [...(sections.data ?? [])].sort((a, b) => a.displayOrder - b.displayOrder);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Manage sections</DialogTitle>
          <DialogDescription>
            Sections group your products (like a menu). A product can be in several.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2">
          <Input
            placeholder="New section name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") add();
            }}
          />
          <Button size="sm" onClick={add} disabled={busy || !newName.trim()}>
            <Plus />
            Add
          </Button>
        </div>

        {sections.isError ? (
          <ErrorState error={sections.error} onRetry={() => void sections.refetch()} />
        ) : list.length === 0 ? (
          <p className="text-sm text-muted-foreground">No sections yet.</p>
        ) : (
          <ul className="divide-y rounded-md border">
            {list.map((s) => (
              <li key={s.id} className="flex items-center gap-2 p-3">
                {editingId === s.id ? (
                  <>
                    <Input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="h-8"
                      onKeyDown={(e) => {
                        if (e.key === "Enter") saveEdit();
                        if (e.key === "Escape") setEditingId(null);
                      }}
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      disabled={busy}
                      onClick={saveEdit}
                      aria-label="Save name"
                    >
                      <Check />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setEditingId(null)}
                      aria-label="Cancel"
                    >
                      <X />
                    </Button>
                  </>
                ) : (
                  <>
                    <span className="min-w-0 flex-1 truncate text-sm">{s.name}</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      disabled={busy}
                      onClick={() => {
                        setEditingId(s.id);
                        setEditName(s.name);
                      }}
                      aria-label={`Rename ${s.name}`}
                    >
                      <Pencil />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      disabled={busy}
                      onClick={() => del(s.id)}
                      aria-label={`Delete ${s.name}`}
                    >
                      <Trash2 />
                    </Button>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}

        {error ? <p className="text-sm text-destructive">{error}</p> : null}
      </DialogContent>
    </Dialog>
  );
}
