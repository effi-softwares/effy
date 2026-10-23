/**
 * Sign out: a server component with two plain forms posting to `/sign-out`, so it needs no auth SDK or
 * JavaScript. Not styled as destructive and not confirmed: signing out is normal and reversible.
 */
export function SessionCard() {
  return (
    <section aria-labelledby="sessions-heading">
      <h2 id="sessions-heading" className="text-lg font-medium">
        Sessions
      </h2>

      <div className="mt-4 flex flex-col gap-3 sm:flex-row">
        <form action="/sign-out" method="post">
          <button
            type="submit"
            data-testid="sign-out"
            className="h-11 rounded-md border px-6 text-sm font-medium hover:bg-accent"
          >
            Sign out
          </button>
        </form>

        {/* The `scope` field is the only difference. */}
        <form action="/sign-out" method="post">
          <input type="hidden" name="scope" value="all" />
          <button
            type="submit"
            data-testid="sign-out-everywhere"
            className="h-11 rounded-md px-6 text-sm font-medium text-muted-foreground hover:text-foreground"
          >
            Sign out on all devices
          </button>
        </form>
      </div>

      {/* Say the true thing: the gateway's JWT authorizer does not know about revocation, so another
          device's token keeps working until it expires (up to an hour). */}
      <p className="mt-3 text-sm text-muted-foreground">
        Signing out on all devices ends every session, including this one. It can take up to an hour
        to take effect on other devices — if you think someone else has access to your account,
        change your password too.
      </p>
    </section>
  )
}
