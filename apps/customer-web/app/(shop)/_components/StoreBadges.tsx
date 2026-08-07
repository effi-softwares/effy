/**
 * Google Play and App Store marks — PRESENT BUT NON-INTERACTIVE (039 US5, FR-021).
 *
 * ⚠ THERE ARE NO URLs IN THIS FILE, AND THAT IS THE POINT. The Effy apps are not published. A store
 * link would have to be invented, and an invented outward-facing identifier is exactly what the
 * constitution's real-world-identifier rule forbids — a wrong one that silently "works" reaches real
 * people before anyone notices. `StoreBadges.test.tsx` greps this module's own text for a store URL and
 * fails on any match, so the rule is mechanical rather than remembered.
 *
 * ⚠ NOT LINKS, NOT BUTTONS. These are `<span>`s. A disabled `<a>` is still focusable and still
 * announced as a link, which promises a destination that does not exist; a `<button disabled>` promises
 * an action. A shopper who taps here should get nothing, and a screen-reader user should be told the
 * apps are coming rather than handed a broken control.
 *
 * ⚠ "Coming soon" is stated IN WORDS, not implied by dimming. Meaning never rests on colour or opacity
 * alone (SC-009) — a low-contrast badge with no label is indistinguishable from a broken image.
 *
 * The marks are drawn monochrome, on the ramp. They are deliberately generic renderings rather than the
 * official trademarked artwork: the real badges are supplied by each store under brand rules that apply
 * to *published* apps, and using them for something that does not exist yet would be wrong on both
 * counts. They get replaced with the official assets in the slice that ships the apps.
 */
export function StoreBadges() {
  return (
    <ul className="flex flex-wrap gap-3">
      {[
        { name: "Google Play", Icon: PlayMark },
        { name: "App Store", Icon: AppleMark },
      ].map(({ name, Icon }) => (
        <li key={name}>
          <span
            className="inline-flex items-center gap-3 rounded-xl border border-border bg-muted/50 px-4 py-2.5 text-muted-foreground"
            // ⚠ One accessible string for the whole badge, so it is never announced as "Google Play"
            // with the availability caveat left to a visually-adjacent chip a screen reader may skip.
            aria-label={`${name} — coming soon`}
          >
            <Icon />
            <span className="flex flex-col leading-tight" aria-hidden="true">
              <span className="text-[0.65rem] uppercase tracking-wide">Coming soon</span>
              <span className="text-sm font-semibold text-foreground">{name}</span>
            </span>
          </span>
        </li>
      ))}
    </ul>
  )
}

function PlayMark() {
  return (
    <svg viewBox="0 0 24 24" className="size-6 shrink-0" aria-hidden="true" fill="currentColor">
      <path d="M3.6 2.3a1 1 0 0 0-.6.9v17.6a1 1 0 0 0 .6.9l9.5-9.7L3.6 2.3Zm11 8.3 2.9-3-9.4-5.3 6.5 8.3Zm0 2.8-6.5 8.3 9.4-5.3-2.9-3Zm4.5-1.4-2.6-1.5-3 3 3 3 2.6-1.5a1.2 1.2 0 0 0 0-2.1Z" />
    </svg>
  )
}

function AppleMark() {
  return (
    <svg viewBox="0 0 24 24" className="size-6 shrink-0" aria-hidden="true" fill="currentColor">
      <path d="M16.4 12.7c0-2.3 1.9-3.4 2-3.5-1.1-1.6-2.8-1.8-3.4-1.8-1.4-.2-2.8.8-3.5.8-.7 0-1.8-.8-3-.8-1.5 0-3 .9-3.8 2.3-1.6 2.8-.4 7 1.2 9.3.8 1.1 1.7 2.4 2.9 2.3 1.2 0 1.6-.7 3-.7s1.8.7 3 .7c1.3 0 2.1-1.1 2.8-2.3.9-1.3 1.3-2.6 1.3-2.6s-2.5-1-2.5-3.7ZM14.2 5.9c.6-.8 1-1.9.9-3-.9 0-2 .6-2.7 1.4-.6.7-1.1 1.8-.9 2.9 1 .1 2-.5 2.7-1.3Z" />
    </svg>
  )
}
