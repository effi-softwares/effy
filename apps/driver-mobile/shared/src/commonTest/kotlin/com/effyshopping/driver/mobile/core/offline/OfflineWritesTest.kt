package com.effyshopping.driver.mobile.core.offline

import com.effyshopping.driver.mobile.core.error.AppError
import com.effyshopping.driver.mobile.core.error.AppException
import com.russhwolf.settings.MapSettings
import kotlinx.coroutines.test.runTest
import kotlinx.io.IOException
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertNull

/** Backlog C1 / B3 — what happens to a write when there is no signal. */
class OfflineWritesTest {
    private fun queue() = OfflineQueue(MapSettings())

    @Test fun a_write_with_no_signal_is_queued_and_answers_queued() = runTest {
        val q = queue()
        val out = q.withReplay("p", "{}", "c1", "Collect", queued = { WriteOutcome.QUEUED }) {
            throw AppException(AppError.Network)
        }
        assertEquals(WriteOutcome.QUEUED, out)
        assertEquals(1, q.count)
    }

    /** Ktor's own transport error never became AppError.Network inside the wrapper, so nothing queued. */
    @Test fun a_transport_error_is_queued_too() = runTest {
        val q = queue()
        q.withReplay("p", "{}", "c1", "Collect", queued = { WriteOutcome.QUEUED }) { throw IOException("no route") }
        assertEquals(1, q.count)
    }

    @Test fun a_refusal_is_not_queued() = runTest {
        val q = queue()
        assertFailsWith<AppException> {
            q.withReplay("p", "{}", "c1", "Collect", queued = { WriteOutcome.QUEUED }) {
                throw AppException(AppError.Validation("no"))
            }
        }
        assertEquals(0, q.count)
    }

    @Test fun one_action_keeps_one_change_id_until_settled() {
        var n = 0
        val ids = ActionIds { "id-${n++}" }
        assertEquals("id-0", ids.of("collect:s1"))
        assertEquals("id-0", ids.of("collect:s1"))
        assertEquals("id-1", ids.of("collect:s2"))
        ids.settled("collect:s1")
        assertEquals("id-2", ids.of("collect:s1"))
    }
}

private class MemoryProofFiles : ProofFiles {
    val files = mutableMapOf<String, ByteArray>()
    override fun write(name: String, bytes: ByteArray) { files[name] = bytes }
    override fun read(name: String): ByteArray? = files[name]
    override fun delete(name: String) { files.remove(name) }
}

class ProofOutboxTest {
    @Test fun a_saved_proof_survives_a_restart_and_is_deleted_once_sent() {
        val settings = MapSettings()
        val files = MemoryProofFiles()
        ProofOutbox(settings, files).add(PendingProof("c1", "d1", "photo", null), byteArrayOf(1, 2))

        val reopened = ProofOutbox(settings, files) // the app was killed and opened again
        assertEquals(listOf("c1"), reopened.pending.value.map { it.changeId })
        assertEquals(true, reopened.isPending("d1"))
        assertEquals(listOf<Byte>(1, 2), reopened.bytes("c1")?.toList())

        reopened.remove("c1")
        assertEquals(0, reopened.pending.value.size)
        assertNull(files.read("c1"))
    }

    @Test fun the_same_proof_is_saved_once() {
        val outbox = ProofOutbox(MapSettings(), MemoryProofFiles())
        outbox.add(PendingProof("c1", "d1", "photo", null), byteArrayOf(1))
        outbox.add(PendingProof("c1", "d1", "photo", null), byteArrayOf(1))
        assertEquals(1, outbox.pending.value.size)
    }
}
