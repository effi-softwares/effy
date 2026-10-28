import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { createMemoryHistory, createRootRoute, createRoute, createRouter, RouterProvider } from "@tanstack/react-router"
import { render } from "@testing-library/react"
import type { ReactNode } from "react"

import type { ListPage } from "@effy/shared-types"

/**
 * Renders a console list screen (103) inside a real in-memory router: the list's view lives in the address,
 * so a screen needs a router to read and write it. `url` is where it opens (`/vehicles?view=retired`).
 */
export function renderList(Screen: () => ReactNode, url = "/") {
  const root = createRootRoute()
  const path = url.split("?")[0] || "/"
  const screen = createRoute({ getParentRoute: () => root, path, component: Screen })
  const anything = createRoute({ getParentRoute: () => root, path: "$", component: () => null })
  const router = createRouter({
    routeTree: root.addChildren([screen, anything]),
    history: createMemoryHistory({ initialEntries: [url] }),
  })
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const result = render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  return { ...result, router }
}

/** A one-page offset list answer. */
export function onePage<T>(items: T[], over: Partial<ListPage<T>> = {}): ListPage<T> {
  return { items, pageSize: 25, total: items.length, totalCapped: false, page: 1, nextCursor: null, ignored: [], ...over }
}
