/**
 * The pages that need an account - the proxy sends a guest from these to sign-in (proxy.ts).
 *
 * This is not the authorization gate. Every protected page and Server Action checks the session
 * itself (`lib/dal.ts`, `lib/session.ts`) and the backend checks it again.
 *
 * No imports, on purpose: client components read it too.
 */
export const ACCOUNT_ROUTES = ["/account", "/addresses", "/checkout", "/orders", "/saved"] as const

/** Whether `href` (a path, optionally with a query) is one of those pages or under one. */
export function needsAccount(href: string): boolean {
  const path = href.split(/[?#]/)[0] ?? href
  return ACCOUNT_ROUTES.some((p) => path === p || path.startsWith(`${p}/`))
}

/**
 * The `prefetch` for a `<Link>` in the public chrome.
 *
 * A link to a page that needs an account is never prefetched. Chrome is rendered once for everyone
 * (it cannot know who is looking), and Next prefetches every link that scrolls into view - so a guest's
 * home page asked for Account, Orders and Saved, was redirected by the proxy, and then prefetched the
 * sign-in page five more times: about a dozen server renders for pages a guest cannot open. A
 * signed-in customer loses the head start on those few links, and nothing else.
 */
export function chromePrefetch(href: string): false | undefined {
  return needsAccount(href) ? false : undefined
}
