package com.effyshopping.driver.mobile.core.offline

import com.russhwolf.settings.Settings
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.io.buffered
import kotlinx.io.files.Path
import kotlinx.io.files.SystemFileSystem
import kotlinx.io.readByteArray
import kotlinx.serialization.Serializable
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.json.Json

/** A proof the driver captured with no signal, waiting to be sent (backlog B3). The image is a file. */
@Serializable
data class PendingProof(
    val changeId: String,
    val dropId: String,
    /** `photo` | `signature` | `contactless` - the domain's ProofMethod name, lower case. */
    val method: String,
    val note: String?,
    val attempts: Int = 0,
    /** How each package was handed over at the door; empty from a proof saved before scanning. */
    val handed: List<com.effyshopping.driver.mobile.core.scan.HandedOver> = emptyList(),
)

/** Where proof images wait on the phone. One file per proof, named by its changeId. */
interface ProofFiles {
    fun write(name: String, bytes: ByteArray)
    fun read(name: String): ByteArray?
    fun delete(name: String)
}

/** [ProofFiles] in a directory the app owns - survives the app being killed. */
class DirectoryProofFiles(directory: String) : ProofFiles {
    private val dir = Path(directory)

    override fun write(name: String, bytes: ByteArray) {
        SystemFileSystem.createDirectories(dir)
        // Written to a temporary name and moved, so a kill mid-write never leaves half a photo.
        val tmp = Path(dir, "$name.tmp")
        SystemFileSystem.sink(tmp).buffered().use { it.write(bytes) }
        SystemFileSystem.atomicMove(tmp, Path(dir, name))
    }

    override fun read(name: String): ByteArray? {
        val file = Path(dir, name)
        if (!SystemFileSystem.exists(file)) return null
        return SystemFileSystem.source(file).buffered().use { it.readByteArray() }
    }

    override fun delete(name: String) {
        SystemFileSystem.delete(Path(dir, name), mustExist = false)
    }
}

/**
 * Proof captured with no connection. The image is written before the record and deleted after the platform
 * confirms the proof, so a kill leaves at worst an orphan file. Sending is presign → upload → submit under
 * one changeId, so a proof whose answer was lost is sent again safely.
 */
class ProofOutbox(
    private val settings: Settings,
    private val files: ProofFiles,
    private val json: Json = Json { ignoreUnknownKeys = true },
) {
    private val listSerializer = ListSerializer(PendingProof.serializer())

    private val _pending = MutableStateFlow(load())
    val pending: StateFlow<List<PendingProof>> = _pending.asStateFlow()

    fun add(proof: PendingProof, bytes: ByteArray) {
        if (_pending.value.any { it.changeId == proof.changeId }) return
        files.write(proof.changeId, bytes)
        persist(_pending.value + proof)
    }

    fun bytes(changeId: String): ByteArray? = files.read(changeId)

    /** The proof is recorded (or refused for good): forget it, then delete its image. */
    fun remove(changeId: String) {
        persist(_pending.value.filterNot { it.changeId == changeId })
        files.delete(changeId)
    }

    fun bumpAttempts(changeId: String) {
        persist(_pending.value.map { if (it.changeId == changeId) it.copy(attempts = it.attempts + 1) else it })
    }

    /** True while a proof for [dropId] is waiting to be sent. */
    fun isPending(dropId: String): Boolean = _pending.value.any { it.dropId == dropId }

    private fun persist(list: List<PendingProof>) {
        settings.putString(KEY, json.encodeToString(listSerializer, list))
        _pending.value = list
    }

    private fun load(): List<PendingProof> {
        val raw = settings.getStringOrNull(KEY) ?: return emptyList()
        return runCatching { json.decodeFromString(listSerializer, raw) }.getOrDefault(emptyList())
    }

    private companion object {
        const val KEY = "driver.offline.proofs.v1"
    }
}
