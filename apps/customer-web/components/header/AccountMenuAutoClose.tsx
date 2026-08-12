"use client"

import { useEffect } from "react"

/**
 * Closes the header account `<details>` menu on an outside click or Escape (012 FR-028).
 *
 * ⚠ The menu is a native `<details>/<summary>` disclosure (see AccountMenu) — deliberately zero-JS so
 * it opens, is keyboard-accessible, and is announced without a hydration boundary. But `<details>` has
 * one gap: the browser closes it only when the `<summary>` is clicked again, NOT when the user clicks
 * anywhere else on the page. This restores the expected dismiss-on-outside-click behaviour.
 *
 * ⚠ It costs the GUEST nothing. It is rendered INSIDE AccountMenu, which UserIsland mounts for a
 * signed-in customer only — the same place AuthSync already lives. An anonymous visitor (who sees a
 * plain "Sign in" link, no menu) never downloads it. It imports only React, so it acquires no path to
 * the auth SDK and stays clear of the `depcruise` quarantine.
 */
export function AccountMenuAutoClose() {
  useEffect(() => {
    const closeMenus = (predicate: (menu: HTMLDetailsElement) => boolean) => {
      document
        .querySelectorAll<HTMLDetailsElement>('details[data-testid="account-menu"][open]')
        .forEach((menu) => {
          if (predicate(menu)) menu.open = false
        })
    }

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null
      closeMenus((menu) => target === null || !menu.contains(target))
    }

    // A click on a menu link navigates client-side (Next <Link>), which does NOT close <details>.
    // Close the menu whose link was clicked so it doesn't linger over the destination page.
    const onClick = (event: MouseEvent) => {
      const link = (event.target as Element | null)?.closest("a")
      if (link) closeMenus((menu) => menu.contains(link))
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeMenus(() => true)
    }

    document.addEventListener("pointerdown", onPointerDown)
    document.addEventListener("click", onClick)
    document.addEventListener("keydown", onKeyDown)
    return () => {
      document.removeEventListener("pointerdown", onPointerDown)
      document.removeEventListener("click", onClick)
      document.removeEventListener("keydown", onKeyDown)
    }
  }, [])

  return null
}
