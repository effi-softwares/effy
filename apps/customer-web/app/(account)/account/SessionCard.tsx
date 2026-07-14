/**
 * Sign out (012 FR-028 … FR-033).
 *
 * ⚠ A SERVER COMPONENT — two plain forms, zero client JavaScript. Same mechanism the header uses
 * (`POST /sign-out`), for the same reason: a form posts to a URL, so nothing here needs the auth SDK,
 * a hydration boundary, or a single byte of JS. Sign-out even works with JavaScript disabled, which
 * is a good property for the control that ends a session.
 *
 * ⚠ NOT STYLED AS DESTRUCTIVE. No red. Signing out is normal and reversible — red is reserved for the
 * genuinely irreversible (deleting an account), and spending it here leaves nothing to say when
 * something really is dangerous.
 *
 * ⚠ NO CONFIRMATION DIALOG. It is a labelled, deliberate action on a page the customer navigated to
 * on purpose. An "are you sure?" after that is the kind of prompt people learn to click through
 * without reading — which is precisely how confirmation dialogs lose their power for the cases that
 * genuinely need them.
 */
export function SessionCard() {
  return (
    <section aria-labelledby="sessions-heading" className="rounded-lg border p-6">
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

        {/* FR-032 — a distinct, deliberate action. The `scope` field is the only difference. */}
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

      {/* ⚠ FR-024a — SAY THE TRUE THING.
          Revoking a session does NOT instantly kill credentials already issued to it: our API
          gateway's JWT authorizer checks signature and expiry and knows nothing of revocation, so
          another device's token keeps working until it EXPIRES — up to an hour on the current pool
          config. "Signed out everywhere, instantly" would be a lie, and it is the kind that matters:
          someone acting on a lost phone deserves to know they should change their password too. */}
      <p className="mt-3 text-sm text-muted-foreground">
        Signing out on all devices ends every session, including this one. It can take up to an hour
        to take effect on other devices — if you think someone else has access to your account,
        change your password too.
      </p>
    </section>
  )
}
