import { useCallback, useState } from "react";

/**
 * Which columns a person hid on a list (103 FR-014): a convenience kept on this device only, never server
 * state. Storage can be missing (a private window, blocked site data), so every read and write is guarded
 * and the list works without it.
 */
const keyOf = (app: string, listId: string) => `effy.table.${app}.${listId}.v1`;

function read(key: string): string[] {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    const hidden = (parsed as { hidden?: unknown })?.hidden;
    return Array.isArray(hidden) ? hidden.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function write(key: string, hidden: string[]): void {
  try {
    window.localStorage.setItem(key, JSON.stringify({ hidden }));
  } catch {
    /* storage unavailable: the choice lasts until the page closes */
  }
}

/**
 * `known` is every column id of the table; anything else in storage (a column since removed) is ignored, and
 * `locked` (the identifying column) can never be hidden.
 */
export function useHiddenColumns(app: string, listId: string, known: readonly string[], locked: readonly string[]) {
  const key = keyOf(app, listId);
  const [hidden, setHidden] = useState<string[]>(() => read(key).filter((id) => known.includes(id) && !locked.includes(id)));

  const toggle = useCallback(
    (id: string, visible: boolean) => {
      if (locked.includes(id)) return;
      setHidden((prev) => {
        const next = visible ? prev.filter((x) => x !== id) : prev.includes(id) ? prev : [...prev, id];
        write(key, next);
        return next;
      });
    },
    [key, locked],
  );

  return { hidden, toggle };
}
