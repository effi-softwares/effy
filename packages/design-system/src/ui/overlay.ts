/**
 * The one backdrop behind every modal layer (Dialog, AlertDialog, Drawer): shadcn's light tint with a
 * blur of the page behind it. A browser without backdrop-filter gets the tint alone.
 */
export const overlayClassName =
  "fixed inset-0 z-50 bg-scrim/60 supports-backdrop-filter:backdrop-blur-[2px] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 duration-(--dur-standard)"

/**
 * A Dialog or AlertDialog below the mobile breakpoint, as a bottom Drawer: the Dialog's `p-6` becomes
 * the phone's 16px gutter, clear of the home indicator.
 */
export const dialogDrawerClassName = "gap-4 px-4 pb-[calc(1rem+env(safe-area-inset-bottom))]"
