import { useSyncExternalStore } from "react"

const never = () => () => { }

/**
 * False in the server's HTML and on the first client render, true once the page has hydrated. For a view
 * whose data lives only in the browser (the cart's localStorage mirror): until then it shows its loading
 * shape - the server cannot know the cart, and its empty snapshot would otherwise say "Your cart is empty"
 * to a shopper who has one.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(never, () => true, () => false)
}
