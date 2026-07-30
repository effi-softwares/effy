package com.effyshopping.customer.mobile.core.util

import kotlin.uuid.ExperimentalUuidApi
import kotlin.uuid.Uuid

/**
 * A random UUIDv4, from Kotlin's own multiplatform `Uuid` — no dependency, no `expect`/`actual`.
 *
 * Used for the cart's `changeId` (027 FR-018), which is the one place in this app where a generated id is
 * load-bearing rather than cosmetic: the platform dedupes on it, so a retry of the same shopper action must
 * carry the SAME id, and two different actions must never collide. Both properties come from the caller
 * minting it once per action — this function only has to be random.
 */
@OptIn(ExperimentalUuidApi::class)
fun newUuid(): String = Uuid.random().toString()
