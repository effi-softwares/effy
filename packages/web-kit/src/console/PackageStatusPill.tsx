import { Badge } from "@effy/design-system/ui";
import { STATUS_TONE, type PackageStatusView } from "@effy/shared-types";

/**
 * Where a package is, as one pill — the same on the back-office and the shop console (073).
 *
 * ⚠ THE WORD IS THE SERVER'S (`view.word`, from `STATUS_WORD`). This component never maps a status to
 * a label itself: four separate maps reading the shop's status are how a collected package came to
 * say "At hub" in one console and "Collected" in the other.
 *
 * The tone only reinforces the word (the closed mapping). A driver's name follows when the view
 * carries one — the shop's never does — and a Problem's one-line reason sits beside it.
 */
export function PackageStatusPill({ view, showDetail = true }: { view: PackageStatusView; showDetail?: boolean }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-0.5">
      <Badge variant={STATUS_TONE[view.status]}>{view.word}</Badge>
      {view.driverName ? <span className="text-sm text-muted-foreground">{view.driverName}</span> : null}
      {showDetail && view.detail ? <span className="text-sm text-destructive">{view.detail}</span> : null}
    </span>
  );
}
