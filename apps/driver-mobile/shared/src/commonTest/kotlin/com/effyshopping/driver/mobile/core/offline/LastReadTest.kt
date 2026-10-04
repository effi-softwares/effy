package com.effyshopping.driver.mobile.core.offline

import com.effyshopping.driver.mobile.core.error.AppError
import com.effyshopping.driver.mobile.core.error.AppException
import kotlinx.coroutines.test.runTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith

/** 065 FR-024 / FR-025 — what a driver sees when a list they already loaded is reopened offline. */
class LastReadTest {
    private data class Thing(val name: String, val stale: Boolean = false)

    private fun reads() = LastRead<String, Thing> { it.copy(stale = true) }

    @Test
    fun `a successful read is returned as it is`() = runTest {
        assertEquals(Thing("a"), reads().fetch("k") { Thing("a") })
    }

    @Test
    fun `a read that fails for connectivity serves the last copy - flagged stale`() = runTest {
        val r = reads()
        r.fetch("k") { Thing("a") }
        assertEquals(Thing("a", stale = true), r.fetch("k") { throw AppException(AppError.Network) })
    }

    /** FR-025 — nothing retained means an ERROR, never an empty list presented as the truth. */
    @Test
    fun `a first read that fails is an error - not an empty answer`() = runTest {
        val e = assertFailsWith<AppException> { reads().fetch("k") { throw AppException(AppError.Network) } }
        assertEquals(AppError.Network, e.error)
    }

    /** A refusal from the platform is never papered over with a memory. */
    @Test
    fun `a not-found is never answered with a remembered copy`() = runTest {
        val r = reads()
        r.fetch("k") { Thing("a") }
        val e = assertFailsWith<AppException> { r.fetch("k") { throw AppException(AppError.NotFound) } }
        assertEquals(AppError.NotFound, e.error)
    }

    @Test
    fun `one key's copy is never served for another`() = runTest {
        val r = reads()
        r.fetch("k1") { Thing("a") }
        assertFailsWith<AppException> { r.fetch("k2") { throw AppException(AppError.Network) } }
    }

    @Test
    fun `a later success replaces the copy and clears the stale flag`() = runTest {
        val r = reads()
        r.fetch("k") { Thing("a") }
        r.fetch("k") { throw AppException(AppError.Network) }
        assertEquals(Thing("b"), r.fetch("k") { Thing("b") })
        assertEquals(Thing("b", stale = true), r.fetch("k") { throw AppException(AppError.Network) })
    }
}
