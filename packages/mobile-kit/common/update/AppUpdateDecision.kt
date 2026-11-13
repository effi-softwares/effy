package com.effyshopping.mobile.kit.update

/** What the phone shows before Home (121). */
sealed interface AppUpdateOutcome {
    /** Below minimum: a full screen; the app cannot be used. */
    data object Mandatory : AppUpdateOutcome

    /** Below recommended: a sheet with Update now and Later, at every launch. */
    data object Optional : AppUpdateOutcome

    /** Below latest: the same sheet, once for [latest]. */
    data class Notice(val latest: Int) : AppUpdateOutcome

    data object None : AppUpdateOutcome
}

/**
 * The one decision (spec FR-001), the twin of TypeScript `decideAppUpdate` in `packages/shared-types/src/app-updates.ts`;
 * both are pinned to `app-updates.fixtures.json` ("decide" cases).
 *
 * [storeAllows] is false only on an Android install from Play when Play says this phone cannot get the update yet (a
 * staged rollout, FR-015). Mandatory never asks the store: a minimum raised too early shows, rather than letting an
 * unsafe build run.
 */
fun decideAppUpdate(
    settings: AppUpdateSettings?,
    platform: AppPlatform,
    build: Int,
    noticeShownFor: Int?,
    storeAllows: Boolean,
): AppUpdateOutcome {
    val p = settings?.forPlatform(platform) ?: return AppUpdateOutcome.None
    return when {
        build < p.minimum -> AppUpdateOutcome.Mandatory
        build < p.recommended && storeAllows -> AppUpdateOutcome.Optional
        build < p.latest && noticeShownFor != p.latest && storeAllows -> AppUpdateOutcome.Notice(p.latest)
        else -> AppUpdateOutcome.None
    }
}
