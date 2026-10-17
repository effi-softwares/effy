package com.effyshopping.driver.mobile

import android.graphics.Color
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.SystemBarStyle
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import com.effyshopping.driver.mobile.core.map.GeoPoint
import com.effyshopping.driver.mobile.core.map.RunMap
import com.effyshopping.driver.mobile.core.map.RunMapStop
import com.effyshopping.driver.mobile.core.nav.DriverTab
import com.effyshopping.driver.mobile.core.opening.Opening
import com.effyshopping.driver.mobile.core.presentation.DriverTabBar
import com.effyshopping.driver.mobile.core.theme.AppearanceMode
import com.effyshopping.driver.mobile.core.theme.EffyTheme
import com.effyshopping.driver.mobile.features.account.AccountScreen
import com.effyshopping.driver.mobile.features.collection.domain.CollectionPackage
import com.effyshopping.driver.mobile.features.collection.domain.CollectionRun
import com.effyshopping.driver.mobile.features.collection.domain.CollectionStop
import com.effyshopping.driver.mobile.features.collection.domain.HubSplit
import com.effyshopping.driver.mobile.features.collection.domain.EffyGroup
import com.effyshopping.driver.mobile.features.collection.domain.PackageMethod
import com.effyshopping.driver.mobile.features.collection.domain.ShopStop
import com.effyshopping.driver.mobile.features.collection.domain.StopStatus
import com.effyshopping.driver.mobile.features.collection.presentation.CollectionRunScreen
import com.effyshopping.driver.mobile.features.collection.presentation.CollectionUiState
import com.effyshopping.driver.mobile.features.collection.presentation.HubCheckinScreen
import com.effyshopping.driver.mobile.features.collection.presentation.PackageProblem
import com.effyshopping.driver.mobile.features.collection.presentation.ShopStopScreen
import com.effyshopping.driver.mobile.features.delivery.domain.DeliveryRun
import com.effyshopping.driver.mobile.features.delivery.domain.DeliveryWindow
import com.effyshopping.driver.mobile.features.delivery.domain.Drop
import com.effyshopping.driver.mobile.features.delivery.domain.DropPackage
import com.effyshopping.driver.mobile.features.delivery.domain.DropStatus
import com.effyshopping.driver.mobile.features.delivery.domain.DropSummary
import com.effyshopping.driver.mobile.features.delivery.domain.FailureReason
import com.effyshopping.driver.mobile.features.delivery.domain.Handover
import com.effyshopping.driver.mobile.features.delivery.domain.ParcelsToReturn
import com.effyshopping.driver.mobile.features.delivery.domain.ProofMethod
import com.effyshopping.driver.mobile.features.delivery.domain.ReturnParcel
import com.effyshopping.driver.mobile.features.delivery.presentation.DeliveryRunScreen
import com.effyshopping.driver.mobile.features.delivery.presentation.DeliveryUiState
import com.effyshopping.driver.mobile.features.delivery.presentation.DropScreen
import com.effyshopping.driver.mobile.features.delivery.presentation.ReturnHubScreen
import com.effyshopping.driver.mobile.features.driver.domain.Driver
import com.effyshopping.driver.mobile.features.driver.domain.DutyStatus
import com.effyshopping.driver.mobile.features.driver.domain.Vehicle
import com.effyshopping.driver.mobile.features.history.domain.History
import com.effyshopping.driver.mobile.features.history.domain.HistoryDay
import com.effyshopping.driver.mobile.features.history.domain.HistoryDetail
import com.effyshopping.driver.mobile.features.history.domain.HistoryDropRow
import com.effyshopping.driver.mobile.features.history.domain.HistoryRunRow
import com.effyshopping.driver.mobile.features.history.domain.HistoryStopRow
import com.effyshopping.driver.mobile.features.history.presentation.HistoryDetailScreen
import com.effyshopping.driver.mobile.features.history.presentation.HistoryScreen
import com.effyshopping.driver.mobile.features.history.presentation.HistoryUiState
import com.effyshopping.driver.mobile.features.manifest.domain.ClassSummary
import com.effyshopping.driver.mobile.features.manifest.domain.ManifestLine
import com.effyshopping.driver.mobile.features.manifest.domain.TemperatureClass
import com.effyshopping.driver.mobile.features.today.domain.Phase
import com.effyshopping.driver.mobile.features.today.domain.Today
import com.effyshopping.driver.mobile.features.today.domain.TodayItem
import com.effyshopping.driver.mobile.features.today.domain.TodayProgress
import com.effyshopping.driver.mobile.features.today.domain.UpcomingRound
import com.effyshopping.driver.mobile.features.today.presentation.TodayScreen
import com.effyshopping.driver.mobile.features.today.presentation.TodayUiState

/**
 * DEBUG ONLY — the design gallery (092 rev 2). Renders one screen with sample data, chosen by the
 * `screen` extra, so it can be screenshotted and compared with `docs/reference-screens/Effy Driver
 * redesigns/`. `dark=true` for the dark appearance. Sample data lives here and nowhere in the app.
 */
class DesignGalleryActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge(statusBarStyle = SystemBarStyle.light(Color.TRANSPARENT, Color.TRANSPARENT))
        super.onCreate(savedInstanceState)
        val screen = intent.getStringExtra("screen") ?: "today"
        val dark = intent.getStringExtra("dark") == "true"
        setContent {
            EffyTheme(mode = if (dark) AppearanceMode.Dark else AppearanceMode.Light) {
                Box(Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) { Gallery(screen) }
            }
        }
    }
}

private val now = System.currentTimeMillis()
private fun window(label: String, startOffsetMin: Int, lengthMin: Int) =
    DeliveryWindow(now + startOffsetMin * 60_000L, now + (startOffsetMin + lengthMin) * 60_000L, label)

private val driver = Driver("d1", "Sam R.", "sam@example.com", null, "Carlton hub", Vehicle("Van", "ABC-123"), DutyStatus.ON_DUTY)

private val hub = GeoPoint(-37.800, 144.967)
private val collectionMap = RunMap(
    listOf(
        RunMapStop(1, RunMapStop.Kind.SHOP, RunMapStop.Status.DONE, GeoPoint(-37.784, 144.970)),
        RunMapStop(2, RunMapStop.Kind.SHOP, RunMapStop.Status.DONE, GeoPoint(-37.799, 144.978)),
        RunMapStop(3, RunMapStop.Kind.SHOP, RunMapStop.Status.NEXT, GeoPoint(-37.767, 144.961)),
        RunMapStop(4, RunMapStop.Kind.SHOP, RunMapStop.Status.TODO, GeoPoint(-37.769, 144.999)),
        RunMapStop(5, RunMapStop.Kind.SHOP, RunMapStop.Status.TODO, GeoPoint(-37.756, 145.001)),
        RunMapStop(null, RunMapStop.Kind.HUB, RunMapStop.Status.TODO, hub),
    ),
    hub,
)
private val deliveryMap = RunMap(
    listOf(
        RunMapStop(null, RunMapStop.Kind.HUB, RunMapStop.Status.DONE, hub),
        RunMapStop(1, RunMapStop.Kind.CUSTOMER, RunMapStop.Status.DONE, GeoPoint(-37.796, 144.966)),
        RunMapStop(2, RunMapStop.Kind.CUSTOMER, RunMapStop.Status.DONE, GeoPoint(-37.799, 144.968)),
        RunMapStop(3, RunMapStop.Kind.CUSTOMER, RunMapStop.Status.DONE, GeoPoint(-37.783, 144.982)),
        RunMapStop(4, RunMapStop.Kind.CUSTOMER, RunMapStop.Status.NEXT, GeoPoint(-37.806, 144.966)),
        RunMapStop(5, RunMapStop.Kind.CUSTOMER, RunMapStop.Status.TODO, GeoPoint(-37.803, 144.970)),
        RunMapStop(6, RunMapStop.Kind.CUSTOMER, RunMapStop.Status.TODO, GeoPoint(-37.797, 144.976)),
        RunMapStop(7, RunMapStop.Kind.CUSTOMER, RunMapStop.Status.TODO, GeoPoint(-37.775, 144.990)),
    ),
    hub,
)

private fun today(phase: Phase): Today = if (phase == Phase.COLLECTION) {
    Today(
        Phase.COLLECTION, "run-c",
        TodayItem(TodayItem.Kind.COLLECTION_STOP, "s3", "run-c", "Brunswick store", null, "pending", place = "410 Sydney Rd, Brunswick VIC 3056", packageCount = 4, coldCount = 1),
        listOf(
            TodayItem(TodayItem.Kind.COLLECTION_STOP, "s4", "run-c", "Northcote store", null, "pending", place = "High St, Northcote", packageCount = 3),
            TodayItem(TodayItem.Kind.COLLECTION_STOP, "s5", "run-c", "Thornbury store", null, "pending", place = "Station St, Thornbury", packageCount = 5),
            TodayItem(TodayItem.Kind.HUB_CHECKIN, "h", "run-c", "Hub check-in", null, "pending"),
        ),
        4, dueLabel = "2:30 pm",
        upcoming = listOf(UpcomingRound("run-d", Phase.DELIVERY, Opening(now + 3_600_000, "3:15 pm"), "6 pm", 7, 12)),
        progress = TodayProgress(done = 2, total = 5, packagesInVan = 7, packagesToLoad = 11),
        map = collectionMap,
    )
} else {
    Today(
        Phase.DELIVERY, "run-d",
        TodayItem(
            TodayItem.Kind.DELIVERY_DROP, "d4", "run-d", "Carlton", null, "out_for_delivery",
            street = "12 Lygon St", place = "Carlton VIC 3053", packageCount = 3, coldCount = 1,
            window = window("Today, 4 pm – 6 pm", -30, 120), handover = Handover.LeaveAtDoor,
        ),
        listOf(
            TodayItem(TodayItem.Kind.DELIVERY_DROP, "d5", "run-d", "Carlton", null, "out", street = "27 Rathdowne St", packageCount = 2, window = window("4 pm – 6 pm", -30, 120)),
            TodayItem(TodayItem.Kind.DELIVERY_DROP, "d6", "run-d", "Fitzroy", null, "out", street = "3/88 Nicholson St", packageCount = 1, window = window("4 pm – 6 pm", -30, 120)),
        ),
        4, dueLabel = "6 pm",
        changedNote = "Northcote and Thornbury are now at the end.",
        progress = TodayProgress(done = 3, total = 7, delivered = 3),
        map = deliveryMap,
    )
}

private fun pkg(ref: String, suburb: String, courier: Boolean, window: String?, items: Int, cold: Boolean, code: String) = CollectionPackage(
    ref, suburb, PackageMethod.SAME_DAY,
    items = List(items) { ManifestLine(listOf("Greek yoghurt 1kg", "Seeded rye loaf 680g", "Free range eggs 12 pack", "Oat milk 1L")[it % 4], if (it == 0) 2 else 1, if (it == 0) 2 else 1, true, if (cold && it == 0) TemperatureClass.Chilled else TemperatureClass.Normal) },
    summary = ClassSummary(0, if (cold) 1 else 0, items - if (cold) 1 else 0, 0),
    toCourier = courier, windowLabel = window, packageId = ref, packageCode = code,
)

private val stops = listOf(
    CollectionStop("s1", 1, "Carlton North store", "CN", 3, StopStatus.COLLECTED, "Rathdowne St, Carlton North VIC 3054", listOf("AAAAA1")),
    CollectionStop("s2", 2, "Fitzroy store", "FZ", 4, StopStatus.SHORT, "Brunswick St, Fitzroy VIC 3065", listOf("AAAAA2")),
    CollectionStop("s3", 3, "Brunswick store", "BR", 4, StopStatus.ASSIGNED, "410 Sydney Rd, Brunswick VIC 3056", listOf("K7M3QX", "P2N8RT", "H4W9ZB", "T6C2VD")),
    CollectionStop("s4", 4, "Northcote store", "NC", 3, StopStatus.ASSIGNED, "High St, Northcote VIC 3070"),
    CollectionStop("s5", 5, "Thornbury store", "TB", 4, StopStatus.ASSIGNED, "Station St, Thornbury VIC 3071"),
)
private val collectionRun = CollectionRun("run-c", "active", stops, dueLabel = "2:30 pm", map = collectionMap)
private val shopStop = ShopStop(
    "s3", "Brunswick store", "BR",
    listOf(
        pkg("EF-20481-2", "Carlton", false, "Today, 4 pm – 6 pm", 4, false, "K7M3QX"),
        pkg("EF-20514-1", "Fitzroy", false, "Thu 15 Oct, 10 am – 12 pm", 3, true, "P2N8RT"),
        pkg("EF-20530-1", "Northcote", false, "Today, 6:30 pm – 8:30 pm", 2, false, "H4W9ZB"),
        pkg("EF-20410-3", "Geelong", true, null, 1, false, "T6C2VD"),
    ),
    StopStatus.ASSIGNED, address = "410 Sydney Rd, Brunswick VIC 3056",
)

private val drops = listOf(
    DropSummary("d1", 1, "EF-1", "Carlton", 1, DropStatus.DELIVERED, street = "5 Faraday St", completedAtIso = "2026-10-17T05:12:00Z", proofMethod = ProofMethod.PHOTO),
    DropSummary("d2", 2, "EF-2", "Carlton", 1, DropStatus.DELIVERED, street = "41 Drummond St", completedAtIso = "2026-10-17T05:20:00Z", proofMethod = ProofMethod.SIGNATURE),
    DropSummary("d3", 3, "EF-3", "Fitzroy North", 2, DropStatus.FAILED, street = "8 Scotchmer St", failureReason = FailureReason.NOBODY_HOME),
    DropSummary("d4", 4, "EF-4", "Carlton", 3, DropStatus.OUT_FOR_DELIVERY, ClassSummary(0, 1, 6, 0), window("Today, 4 pm – 6 pm", -30, 120), street = "12 Lygon St"),
    DropSummary("d5", 5, "EF-5", "Carlton", 2, DropStatus.OUT_FOR_DELIVERY, window = window("4 pm – 6 pm", -30, 120), street = "27 Rathdowne St"),
    DropSummary("d6", 6, "EF-6", "Fitzroy", 1, DropStatus.OUT_FOR_DELIVERY, window = window("3 pm – 5 pm", -180, 120), street = "3/88 Nicholson St"),
    DropSummary("d7", 7, "EF-7", "Northcote", 2, DropStatus.OUT_FOR_DELIVERY, window = window("Any time · 4 pm – 9 pm", 60, 300), street = "140 Bell St"),
)
private val deliveryRun = DeliveryRun("run-d", "active", drops, dueLabel = "6 pm", map = deliveryMap)
private val drop = Drop(
    "d4", "EF-20481", "Alex Smith", "12 Lygon St, Carlton VIC 3053", "Side gate, code 2468. Leave by the blue door.",
    listOf(
        DropPackage("EF-20481", 1, List(3) { ManifestLine(listOf("Oat milk barista 1L", "Royal gala apples 1kg", "Crunchy granola 500g")[it], if (it == 0) 2 else 1, 1, true, TemperatureClass.Normal) }, ClassSummary(0, 0, 4, 0), "K7M3QX"),
        DropPackage("EF-20481", 1, emptyList(), ClassSummary(0, 2, 0, 0), "P2N8RT"),
        DropPackage("EF-20481", 1, emptyList(), ClassSummary(0, 0, 1, 0), "H4W9ZB"),
    ),
    DropStatus.OUT_FOR_DELIVERY, ClassSummary(0, 1, 6, 0), Handover.LeaveAtDoor, window("Today, 4 pm – 6 pm", -30, 120), customerPhone = "0400 000 000",
)

@Composable
private fun Gallery(screen: String) {
    val noop: () -> Unit = {}
    when (screen) {
        "today", "today-delivery", "today-off", "today-return" -> Column(Modifier.fillMaxSize()) {
            Box(Modifier.weight(1f)) {
                TodayScreen(
                    driver = driver,
                    state = when (screen) {
                        "today-off" -> TodayUiState(dutyStatus = DutyStatus.OFF_DUTY)
                        "today-return" -> TodayUiState(
                            dutyStatus = DutyStatus.ON_DUTY,
                            today = Today(
                                Phase.DELIVERY, "run-d", null, emptyList(), 0, dueLabel = "6 pm",
                                toReturn = ParcelsToReturn("run-d", 2, listOf("EF-20466"), listOf("AAAAA1", "AAAAA2"), listOf(ReturnParcel("EF-20466-1", "AAAAA1", "8 Scotchmer St, Fitzroy North", FailureReason.NOBODY_HOME))),
                                progress = TodayProgress(done = 7, total = 7, delivered = 6, notDelivered = 1),
                            ),
                        )
                        else -> TodayUiState(dutyStatus = DutyStatus.ON_DUTY, today = today(if (screen == "today") Phase.COLLECTION else Phase.DELIVERY))
                    },
                    onToggleDuty = noop, onRefresh = noop, onOpenRun = { _, _ -> }, onOpenItem = { _, _ -> }, onOpenReturn = { _, _ -> }, onNavigate = {},
                )
            }
            DriverTabBar(DriverTab.TODAY, {})
        }
        "collection-run" -> CollectionRunScreen(CollectionUiState(run = collectionRun), "Carlton hub", noop, {}, noop, noop)
        "shop-stop" -> ShopStopScreen(
            CollectionUiState(run = collectionRun, stop = shopStop, confirmedPackageIds = setOf("EF-20481-2", "EF-20514-1"), reportedPackages = mapOf("EF-20530-1" to PackageProblem("Missing", null))),
            3, 5, noop, noop, {}, {}, { _, _, _ -> }, {}, noop, {}, noop,
        )
        "scan-shop" -> ShopStopScreen(CollectionUiState(run = collectionRun, stop = shopStop), 3, 5, noop, noop, {}, {}, { _, _, _ -> }, {}, noop, {}, noop, startScanning = true)
        "hub" -> HubCheckinScreen(CollectionUiState(run = collectionRun.copy(stops = stops.map { it.copy(status = StopStatus.COLLECTED) })), "Carlton hub", noop, { _, _ -> }, noop, {})
        "hub-done" -> HubCheckinScreen(
            CollectionUiState(run = collectionRun, hubSplit = HubSplit(17, 13, 4, 4, listOf(EffyGroup("Today, 4 pm – 6 pm", 8, true), EffyGroup("Today, 6:30 pm – 8:30 pm", 2, true), EffyGroup("Thu 15 Oct, 10 am – 12 pm", 3, false)), "4:00 pm")),
            "Carlton hub", noop, { _, _ -> }, noop, {}, nextRun = "Your delivery run opens at 3:15 pm" to "Today, 4 pm – 6 pm · 7 drops · it's on Today.",
        )
        "delivery-run" -> DeliveryRunScreen(DeliveryUiState(run = deliveryRun), "Carlton hub", noop, {}, noop, { _, _ -> }, {})
        "drop" -> DropScreen(DeliveryUiState(run = deliveryRun, drop = drop), "Carlton hub", noop, {}, {}, { _, _, _, _ -> }, { _, _ -> }, noop, noop, noop, noop, noop)
        "door-scan" -> DropScreen(DeliveryUiState(run = deliveryRun, drop = drop), "Carlton hub", noop, {}, {}, { _, _, _, _ -> }, { _, _ -> }, noop, noop, noop, noop, noop, startScanning = true)
        "delivered" -> DropScreen(DeliveryUiState(run = deliveryRun, drop = drop, delivered = true, deliveredWith = ProofMethod.CONTACTLESS, deliveredAtEpochMillis = now, deliveredNote = "Left at: Front door"), "Carlton hub", noop, {}, {}, { _, _, _, _ -> }, { _, _ -> }, noop, noop, noop, noop, noop)
        "not-delivered" -> DropScreen(DeliveryUiState(run = deliveryRun, drop = drop, failed = true, failedReason = FailureReason.OTHER, failedNote = "Building locked, no answer on intercom.", deliveredAtEpochMillis = now), "Carlton hub", noop, {}, {}, { _, _, _, _ -> }, { _, _ -> }, noop, noop, noop, noop, noop)
        "return" -> ReturnHubScreen(
            DeliveryUiState(run = deliveryRun.copy(toReturn = ParcelsToReturn("run-d", 2, listOf("EF-20466"), listOf("AAAAA1", "AAAAA2"), listOf(ReturnParcel("EF-20466-1", "AAAAA1", "8 Scotchmer St, Fitzroy North", FailureReason.NOBODY_HOME), ReturnParcel("EF-20466-2", "AAAAA2", "8 Scotchmer St, Fitzroy North", FailureReason.NOBODY_HOME))))),
            "Carlton hub", "Today", false, noop, {}, {},
        )
        "history" -> Column(Modifier.fillMaxSize()) {
            Box(Modifier.weight(1f)) {
                HistoryScreen(
                    HistoryUiState(
                        history = History(
                            listOf(
                                HistoryDay(
                                    "2026-10-17",
                                    listOf(HistoryRunRow("r1", "collection", "2026-10-17T03:18:00Z", 5, 17)),
                                    listOf(
                                        HistoryDropRow("x1", "EF-1", "Carlton", "2026-10-17T05:20:00Z", true, "41 Drummond St", "signature"),
                                        HistoryDropRow("x2", "EF-2", "Carlton", "2026-10-17T05:12:00Z", true, "5 Faraday St", "contactless"),
                                    ),
                                ),
                                HistoryDay(
                                    "2026-10-16",
                                    listOf(HistoryRunRow("r2", "same_day_delivery", "2026-10-16T06:51:00Z", 7, 12)),
                                    listOf(HistoryDropRow("x3", "EF-3", "Fitzroy North", "2026-10-16T06:02:00Z", false, "8 Scotchmer St", null, "nobody_home")),
                                ),
                            ),
                        ),
                    ),
                    {}, { _, _ -> }, noop,
                )
            }
            DriverTabBar(DriverTab.HISTORY, {})
        }
        "past-run" -> HistoryDetailScreen(
            HistoryUiState(detail = HistoryDetail(emptyList(), null, null, stops = drops.map { HistoryStopRow(it.dropId, it.sequence, "drop", "${it.street}, ${it.customerSuburb}", it.status != DropStatus.FAILED, "2026-10-16T06:09:00Z", "photo") }, map = deliveryMap.copy(stops = deliveryMap.stops.map { it.copy(status = RunMapStop.Status.DONE) }))),
            "Delivery run", "run", noop,
        )
        "account" -> Column(Modifier.fillMaxSize()) {
            Box(Modifier.weight(1f)) {
                AccountScreen(driver, AppearanceMode.System, {}, false, noop, noop, "1.0", "0390000000", "0390000001", "https://example.com", {}, {})
            }
            DriverTabBar(DriverTab.ACCOUNT, {})
        }
        else -> Box(Modifier.fillMaxWidth())
    }
}
