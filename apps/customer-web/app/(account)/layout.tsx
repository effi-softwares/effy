import Link from "next/link"

/**
 * The account area.
 *
 * ⚠ There is NO auth check in this layout, and that is deliberate — not an oversight.
 *
 * Next's authentication guide is explicit: "Due to Partial Rendering, be cautious when doing checks
 * in Layouts as these DON'T RE-RENDER ON NAVIGATION, meaning the user session won't be checked on
 * every route change." A guard here would run once and then quietly stop guarding.
 *
 * The check lives in `requireCustomer()` (lib/dal.ts), called by every page in this group.
 */
export default function AccountLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="flex min-h-svh flex-col">
      <header className="border-b">
        <div className="mx-auto flex h-16 w-full max-w-7xl items-center gap-6 px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2" aria-label="Effy home">
            <span className="inline-block size-6 rounded-md bg-primary" aria-hidden="true" />
            <span className="text-lg font-semibold tracking-tight">Effy</span>
          </Link>
          <div className="flex-1" />
          <Link
            href="/browse"
            className="text-sm font-medium text-muted-foreground hover:text-foreground"
          >
            Browse
          </Link>
        </div>
      </header>
      <main className="flex-1">{children}</main>
    </div>
  )
}
