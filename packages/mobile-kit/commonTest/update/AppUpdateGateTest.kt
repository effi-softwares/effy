package com.effyshopping.mobile.kit.update

import io.ktor.client.HttpClient
import io.ktor.client.engine.mock.MockEngine
import io.ktor.client.engine.mock.respond
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpStatusCode
import io.ktor.http.headersOf
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.withContext
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

private fun settings(minimum: Int = 0, recommended: Int = 0, latest: Int = 0, storeUrl: String? = "https://apps.apple.com/au/app/id6740012345") =
    AppUpdateSettings(
        ios = PlatformUpdateSettings(minimum, recommended, latest, storeUrl),
        android = PlatformUpdateSettings(minimum, recommended, latest, storeUrl?.let { "https://play.google.com/store/apps/details?id=x" }),
    )

private class FakeSource(
    var fetchDelayMs: Long = 0,
    var answer: AppUpdateSettings? = null,
    var savedAnswer: Pair<AppUpdateSettings, Long>? = null,
) : AppUpdateSource {
    var fetches = 0
    private var notice: Int? = null
    private var prompted: Int? = null

    override suspend fun fetch(): AppUpdateSettings? {
        fetches++
        delay(fetchDelayMs)
        return answer
    }

    override fun saved() = savedAnswer

    override fun noticeShownFor() = notice

    override fun markNoticeShown(latest: Int) {
        notice = latest
    }

    override fun promptedOnBuild() = prompted

    override fun setPromptedOnBuild(build: Int?) {
        prompted = build
    }
}

private class FakeUpdater(
    override val platform: AppPlatform = AppPlatform.Ios,
    var storeInstall: Boolean = false,
    var available: Boolean? = null,
    var canImmediate: Boolean = false,
    var canFlexible: Boolean = false,
    /** How long the store takes to answer (Play asking about this install). */
    var answerDelayMs: Long = 0,
) : StoreUpdater {
    val opened = mutableListOf<String?>()
    var immediateStarts = 0
    var downloaded: (() -> Unit)? = null

    override suspend fun isStoreInstall() = storeInstall

    override suspend fun updateAvailable() = available

    override suspend fun startImmediate(): Boolean {
        immediateStarts++
        return canImmediate
    }

    override suspend fun startFlexible(onDownloaded: () -> Unit): Boolean {
        delay(answerDelayMs)
        downloaded = onDownloaded
        return canFlexible
    }

    override fun completeFlexible() = Unit

    override fun openStore(storeUrl: String?) {
        opened += storeUrl
    }

    override fun leaveApp() = Unit
}

@OptIn(ExperimentalCoroutinesApi::class)
class AppUpdateGateTest {
    private fun TestScope.gate(source: AppUpdateSource, updater: StoreUpdater = FakeUpdater(), build: Int = 10) =
        AppUpdateGate(source, updater, build, now = { testScheduler.currentTime }, scope = this)

    @Test
    fun `the real answer wins over a saved one - no sheet that then turns into another screen`() = runTest {
        val source = FakeSource(fetchDelayMs = 200, answer = settings(minimum = 11), savedAnswer = settings(recommended = 11) to 0L)
        val g = gate(source)
        val seen = mutableListOf<GateState>()
        backgroundScope.launch { g.state.collect { seen += it } }
        g.onLaunch()
        advanceUntilIdle()
        runCurrent() // let the background collector see the last value
        assertEquals(listOf(GateState.Checking, GateState.Mandatory), seen)
    }

    @Test
    fun `no answer within the wait lets the person in - and a late mandatory takes over`() = runTest {
        val source = FakeSource(fetchDelayMs = 5_000, answer = settings(minimum = 11))
        val g = gate(source)
        g.onLaunch()
        advanceTimeBy(1_499); runCurrent()
        assertEquals(GateState.Checking, g.state.value)
        advanceTimeBy(2); runCurrent()
        assertEquals(GateState.Passed, g.state.value)
        advanceTimeBy(4_000); runCurrent()
        assertEquals(GateState.Mandatory, g.state.value)
    }

    @Test
    fun `a stale saved answer is used when the read is too slow`() = runTest {
        val source = FakeSource(fetchDelayMs = 5_000, answer = null, savedAnswer = settings(recommended = 11) to -10 * 60_000L)
        val g = gate(source)
        g.onLaunch()
        advanceTimeBy(1_501); runCurrent()
        assertEquals(GateState.Optional, g.state.value)
    }

    @Test
    fun `a late optional answer waits for the next launch`() = runTest {
        val source = FakeSource(fetchDelayMs = 5_000, answer = settings(recommended = 11))
        val g = gate(source)
        g.onLaunch()
        advanceUntilIdle()
        assertEquals(GateState.Passed, g.state.value)
    }

    @Test
    fun `no answer and nothing saved lets the person in`() = runTest {
        val g = gate(FakeSource(answer = null))
        g.onLaunch()
        advanceUntilIdle()
        assertEquals(GateState.Passed, g.state.value)
    }

    @Test
    fun `a saved mandatory answer holds with no connection`() = runTest {
        val source = FakeSource(answer = null, savedAnswer = settings(minimum = 11) to -60 * 60_000L)
        val g = gate(source)
        g.onLaunch()
        advanceUntilIdle()
        assertEquals(GateState.Mandatory, g.state.value)
    }

    @Test
    fun `a stale mandatory is released when the read says the minimum was lowered`() = runTest {
        val source = FakeSource(answer = settings(), savedAnswer = settings(minimum = 11) to 0L)
        val g = gate(source)
        g.onLaunch()
        runCurrent()
        advanceUntilIdle()
        assertEquals(GateState.Passed, g.state.value)
    }

    @Test
    fun `a second launch in the same process decides nothing new`() = runTest {
        val source = FakeSource(answer = settings())
        val g = gate(source)
        g.onLaunch(); g.onLaunch()
        advanceUntilIdle()
        assertEquals(1, source.fetches)
    }

    @Test
    fun `coming back to the screen acts on mandatory only`() = runTest {
        val source = FakeSource(answer = settings())
        val g = gate(source)
        g.onLaunch(); advanceUntilIdle()
        source.answer = settings(recommended = 11, latest = 12)
        g.onForeground(); advanceUntilIdle()
        assertEquals(GateState.Passed, g.state.value)
        source.answer = settings(minimum = 11, recommended = 11, latest = 12)
        g.onForeground(); advanceUntilIdle()
        assertEquals(GateState.Mandatory, g.state.value)
    }

    @Test
    fun `the notice is shown once per latest build`() = runTest {
        val source = FakeSource(answer = settings(latest = 11))
        val first = gate(source)
        first.onLaunch(); advanceUntilIdle()
        assertEquals(GateState.Notice(11), first.state.value)
        val second = gate(source) // the next launch: a new process
        second.onLaunch(); advanceUntilIdle()
        assertEquals(GateState.Passed, second.state.value)
        assertTrue(second.available.value, "Account still says an update is available")
        source.answer = settings(latest = 12)
        val third = gate(source)
        third.onLaunch(); advanceUntilIdle()
        assertEquals(GateState.Notice(12), third.state.value)
    }

    @Test
    fun `optional is asked at every launch until updated`() = runTest {
        val source = FakeSource(answer = settings(recommended = 11, latest = 11))
        repeat(2) {
            val g = gate(source)
            g.onLaunch(); advanceUntilIdle()
            assertEquals(GateState.Optional, g.state.value)
            g.later()
            assertEquals(GateState.Passed, g.state.value)
        }
    }

    @Test
    fun `on a Play install with no update for this phone - optional and notice are hidden but mandatory is not`() = runTest {
        val updater = FakeUpdater(platform = AppPlatform.Android, storeInstall = true, available = false)
        val optional = gate(FakeSource(answer = settings(recommended = 11, latest = 11)), updater)
        optional.onLaunch(); advanceUntilIdle()
        assertEquals(GateState.Passed, optional.state.value)
        val mandatory = gate(FakeSource(answer = settings(minimum = 11, recommended = 11, latest = 11)), updater)
        mandatory.onLaunch(); advanceUntilIdle()
        assertEquals(GateState.Mandatory, mandatory.state.value)
    }

    @Test
    fun `a sideloaded Android build is decided by the settings alone`() = runTest {
        val updater = FakeUpdater(platform = AppPlatform.Android, storeInstall = false)
        val g = gate(FakeSource(answer = settings(recommended = 11, latest = 11)), updater)
        g.onLaunch(); advanceUntilIdle()
        assertEquals(GateState.Optional, g.state.value)
    }

    @Test
    fun `update now downloads in the background when it can - else opens the store`() = runTest {
        val updater = FakeUpdater(platform = AppPlatform.Android, storeInstall = true, available = true, canFlexible = true)
        val g = gate(FakeSource(answer = settings(recommended = 11, latest = 11)), updater)
        g.onLaunch(); advanceUntilIdle()
        g.updateNow(); advanceUntilIdle()
        assertEquals(GateState.Passed, g.state.value)
        assertEquals(FlexibleDownload.Downloading, g.download.value)
        updater.downloaded!!.invoke()
        assertEquals(FlexibleDownload.Downloaded, g.download.value)
        assertTrue(updater.opened.isEmpty())

        val ios = FakeUpdater()
        val g2 = gate(FakeSource(answer = settings(recommended = 11, latest = 11)), ios)
        g2.onLaunch(); advanceUntilIdle()
        g2.updateNow(); advanceUntilIdle()
        assertEquals(listOf<String?>("https://apps.apple.com/au/app/id6740012345"), ios.opened)
        assertEquals(FlexibleDownload.Idle, g2.download.value)
        assertEquals(GateState.Optional, g2.state.value, "the sheet is still there on the way back from the store")
        g2.later()
        assertEquals(GateState.Passed, g2.state.value)
    }

    @Test
    fun `while the store is asked the sheet stays and shows it is working - a second tap does nothing`() = runTest {
        val updater = FakeUpdater(platform = AppPlatform.Android, storeInstall = false, answerDelayMs = 1_000)
        val g = gate(FakeSource(answer = settings(recommended = 11, latest = 11)), updater)
        g.onLaunch(); advanceUntilIdle()
        g.updateNow(); runCurrent()
        assertTrue(g.busy.value)
        assertEquals(GateState.Optional, g.state.value, "never Home first")
        g.updateNow(); advanceUntilIdle()
        assertEquals(1, updater.opened.size, "one store page, not two")
        assertFalse(g.busy.value)
        assertEquals(GateState.Optional, g.state.value)
    }

    @Test
    fun `update now on the mandatory screen tries the in-app update - then the store - and stays mandatory`() = runTest {
        val updater = FakeUpdater()
        val g = gate(FakeSource(answer = settings(minimum = 11, recommended = 11, latest = 11)), updater)
        g.onLaunch(); advanceUntilIdle()
        g.updateNow(); advanceUntilIdle()
        assertEquals(1, updater.immediateStarts)
        assertEquals(1, updater.opened.size)
        assertEquals(GateState.Mandatory, g.state.value)
    }

    @Test
    fun `with no store page - update now is not offered`() = runTest {
        val g = gate(FakeSource(answer = settings(recommended = 11, latest = 11, storeUrl = null)))
        g.onLaunch(); advanceUntilIdle()
        assertEquals(GateState.Optional, g.state.value)
        assertFalse(g.updateOffered.value)
    }

    @Test
    fun `the first launch on a newer build knows it was updated from a prompt`() = runTest {
        val source = FakeSource(answer = settings(recommended = 11, latest = 11))
        gate(source, build = 10).also { it.onLaunch(); advanceUntilIdle() }
        val after = gate(source, build = 11)
        after.onLaunch(); advanceUntilIdle()
        assertEquals(10, after.takeUpdatedFrom())
        assertNull(after.takeUpdatedFrom(), "said once")
        assertEquals(GateState.Passed, after.state.value)
    }
}

class AppUpdateRepositoryTest {
    private val body = """{"schema":1,"ios":{"minimum":1,"recommended":2,"latest":3,"storeUrl":null},"android":{"minimum":0,"recommended":0,"latest":0,"storeUrl":null}}"""

    private fun repo(store: AppUpdateStore, now: Long, respond: (etag: String?) -> Triple<HttpStatusCode, String, String?>) =
        AppUpdateRepository(
            client = HttpClient(MockEngine { request ->
                val (status, content, etag) = respond(request.headers[HttpHeaders.IfNoneMatch])
                respond(content, status, if (etag != null) headersOf(HttpHeaders.ETag, etag) else headersOf())
            }),
            url = "https://media.example/app-updates/customer.json",
            store = store,
            now = { now },
        )

    // Real time, not the test scheduler's: the mock engine answers on another thread, and virtual time would fire the
    // repository's 10 s timeout at once.
    private fun real(block: suspend () -> Unit) = runTest { withContext(Dispatchers.Default) { block() } }

    @Test
    fun `a 200 is saved with its etag - and a 304 reuses it`() = real {
        val store = InMemoryAppUpdateStore()
        val first = repo(store, now = 100) { Triple(HttpStatusCode.OK, body, "\"v1\"") }.fetch()
        assertEquals(1, first?.ios?.minimum)
        assertEquals(100L, repo(store, 0) { error("unused") }.saved()?.second)

        var sentEtag: String? = null
        val second = repo(store, now = 200) { etag -> sentEtag = etag; Triple(HttpStatusCode.NotModified, "", null) }.fetch()
        assertEquals("\"v1\"", sentEtag)
        assertEquals(3, second?.ios?.latest)
        assertEquals(200L, repo(store, 0) { error("unused") }.saved()?.second)
    }

    @Test
    fun `an error or a broken file is no answer and keeps what was saved`() = real {
        val store = InMemoryAppUpdateStore()
        repo(store, now = 100) { Triple(HttpStatusCode.OK, body, "\"v1\"") }.fetch()
        assertNull(repo(store, now = 200) { Triple(HttpStatusCode.Forbidden, "<Error/>", null) }.fetch())
        assertNull(repo(store, now = 300) { Triple(HttpStatusCode.OK, "{\"schema\":2}", "\"v2\"") }.fetch())
        assertEquals(100L, repo(store, 0) { error("unused") }.saved()?.second)
    }
}
