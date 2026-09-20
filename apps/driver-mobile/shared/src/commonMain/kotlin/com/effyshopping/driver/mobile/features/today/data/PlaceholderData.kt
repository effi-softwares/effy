package com.effyshopping.driver.mobile.features.today.data

import com.effyshopping.driver.mobile.core.placeholder.Sourced
import com.effyshopping.driver.mobile.core.placeholder.decorative
import com.effyshopping.driver.mobile.core.placeholder.operational

/**
 * Every value on the Today screens that the platform cannot supply (060 US2, FR-013…FR-017a).
 *
 * ⚠ **One file, nothing inline.** Placeholder data is invisible in the running app (FR-016), so the
 * register in `specs/060-driver-mobile-ui/provenance-register.md` is the only record that it exists
 * — and a value typed straight into a `Text(...)` is undiscoverable six months from now.
 * `PlaceholderRegisterGuardTest` fails if anything here is missing from that register.
 *
 * ⚠ Nothing here is copied from the design's sample content (FR-012). No "Jomo Okafor", no Melbourne
 * street addresses, no `EFY-409xx` references — a real driver seeing another person's name on their
 * own screen is worse than seeing an obvious stand-in.
 */
object TodayPlaceholders {

    // ── OPERATIONAL: a driver could plan around these, so they never render as a value ───────────

    /**
     * ⚠ The design's hero footer reads "6 packages · 0.6 km · ETA 9:38". Two of those three are
     * fiction: there is no routing engine, and there are no coordinates to route between (049 R13 —
     * shops carry no address). A driver reads an ETA and decides whether to take the next job.
     */
    val eta: Sourced<Nothing?> = operational("A routing provider + shop geodata (049 R13)")

    /** ⚠ Same cause: no coordinates, so no distance. */
    val distance: Sourced<Nothing?> = operational("Shop geodata — `shop.address` + geocoding")

    /**
     * ⚠ The design shows "12:30–1:00" against a drop. 052 R4 established the platform's delivery
     * promise is **date-granular** — there is no time window anywhere and none can be derived. A
     * driver telling a customer "between 12:30 and 1" would be inventing a commitment Effy has not
     * made.
     */
    val deliveryWindow: Sourced<Nothing?> = operational("A delivery time-window model (052 R4)")

    /**
     * ⚠ Off-duty "Stops done" and "Shift length". There is no shift or roster model, and no
     * completed-stop count. Rendering `0` after a full shift would tell a driver their work did not
     * register — which is why these are OPERATIONAL and not decorative.
     */
    val stopsDoneToday: Sourced<Nothing?> = operational("A shift/roster model with a completed-stop count")
    val shiftLength: Sourced<Nothing?> = operational("A shift/roster model")

    // ── DECORATIVE: invented, but acting on them costs nothing ───────────────────────────────────

    /**
     * The map strip on the current-stop hero. Real OpenStreetMap cartography arrives in Phase 5;
     * until then the card reserves its space with a neutral panel rather than collapsing, so the
     * layout a driver learns does not change under them later.
     */
    val heroMapStrip: Sourced<String> =
        decorative("map-pending", "Phase 5 (MapLibre + OpenFreeMap) and shop geodata for the pins")

    /** The design's "bay 2" / "dock A" detail. `shop` carries no premises information. */
    val bayDetail: Sourced<String> = decorative("", "Premises fields on `shop` (bay, dock, access notes)")
}
