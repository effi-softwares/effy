import type { ReactNode } from "react";

/**
 * A list's page (103 FR-011): its header, then the list, which takes the rest of the window. From `md` up the
 * console's main area is held to the window while it shows a ListPage (`.ef-main:has(> .ef-listpage)`), so
 * the list's frame reaches the bottom whether it has three rows or a hundred, and only the rows scroll. On a
 * phone the page scrolls as usual.
 */
export function ListPage({ header, children }: { header?: ReactNode; children: ReactNode }) {
  return (
    <div className="ef-listpage">
      {header}
      {children}
    </div>
  );
}
