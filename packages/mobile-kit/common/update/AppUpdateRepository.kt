package com.effyshopping.mobile.kit.update

import io.ktor.client.HttpClient
import io.ktor.client.request.get
import io.ktor.client.request.header
import io.ktor.client.statement.bodyAsText
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpStatusCode
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.withTimeoutOrNull
import kotlinx.serialization.json.Json

/** What the gate needs from the data layer (121). The fake in the tests implements it too. */
interface AppUpdateSource {
    /** Read the file now. Null when there is no usable answer (offline, an error, a file this version cannot read). */
    suspend fun fetch(): AppUpdateSettings?

    /** The last usable answer and when it was last confirmed, or null. */
    fun saved(): Pair<AppUpdateSettings, Long>?

    fun noticeShownFor(): Int?

    fun markNoticeShown(latest: Int)

    fun promptedOnBuild(): Int?

    fun setPromptedOnBuild(build: Int?)
}

/**
 * Reads `https://media.<zone>/app-updates/<app>.json` (contracts/app-update-settings.md) with the saved ETag, so an
 * unchanged file is an empty 304. Every usable answer is saved through [store]. Never throws.
 */
class AppUpdateRepository(
    private val client: HttpClient,
    private val url: String,
    private val store: AppUpdateStore,
    private val now: () -> Long,
    private val requestTimeoutMs: Long = 10_000,
) : AppUpdateSource {
    private val json = Json { ignoreUnknownKeys = true }

    override suspend fun fetch(): AppUpdateSettings? {
        if (url.isBlank()) return null
        val previous = savedAnswer()
        return try {
            withTimeoutOrNull(requestTimeoutMs) {
                val response = client.get(url) {
                    previous?.etag?.let { header(HttpHeaders.IfNoneMatch, it) }
                }
                when (response.status) {
                    HttpStatusCode.NotModified -> previous?.let { saved ->
                        parseAppUpdateSettings(saved.body)?.also { save(saved.copy(fetchedAtEpochMs = now())) }
                    }
                    HttpStatusCode.OK -> {
                        val body = response.bodyAsText()
                        parseAppUpdateSettings(body)?.also {
                            save(SavedAnswer(body = body, etag = response.headers[HttpHeaders.ETag], fetchedAtEpochMs = now()))
                        }
                    }
                    else -> null
                }
            }
        } catch (e: CancellationException) {
            throw e
        } catch (_: Throwable) {
            null
        }
    }

    override fun saved(): Pair<AppUpdateSettings, Long>? {
        val answer = savedAnswer() ?: return null
        val settings = parseAppUpdateSettings(answer.body) ?: return null
        return settings to answer.fetchedAtEpochMs
    }

    override fun noticeShownFor(): Int? = store.getString(AppUpdateKeys.NOTICE_SHOWN_FOR)?.toIntOrNull()

    override fun markNoticeShown(latest: Int) = store.putString(AppUpdateKeys.NOTICE_SHOWN_FOR, latest.toString())

    override fun promptedOnBuild(): Int? = store.getString(AppUpdateKeys.PROMPTED_ON_BUILD)?.toIntOrNull()

    override fun setPromptedOnBuild(build: Int?) = store.putString(AppUpdateKeys.PROMPTED_ON_BUILD, build?.toString() ?: "")

    private fun savedAnswer(): SavedAnswer? =
        store.getString(AppUpdateKeys.SAVED)?.let { runCatching { json.decodeFromString<SavedAnswer>(it) }.getOrNull() }

    private fun save(answer: SavedAnswer) = store.putString(AppUpdateKeys.SAVED, json.encodeToString(SavedAnswer.serializer(), answer))
}
