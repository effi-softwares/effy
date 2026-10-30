package com.effyshopping.driver.mobile.core.scan

import androidx.compose.ui.test.ExperimentalTestApi
import androidx.compose.ui.test.hasSetTextAction
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTextInput
import androidx.compose.ui.test.runComposeUiTest
import com.effyshopping.driver.mobile.features.delivery.domain.DeliveryRun
import com.effyshopping.driver.mobile.features.delivery.domain.Drop
import com.effyshopping.driver.mobile.features.delivery.domain.DropPackage
import com.effyshopping.driver.mobile.features.delivery.domain.DropStatus
import com.effyshopping.driver.mobile.features.delivery.domain.DropSummary
import com.effyshopping.driver.mobile.features.delivery.presentation.DeliveryUiState
import com.effyshopping.driver.mobile.features.delivery.presentation.DropScreen
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.test.performKeyInput
import androidx.compose.ui.test.withKeyDown
import androidx.compose.ui.input.key.Key
import kotlin.test.Test
import androidx.compose.runtime.getValue
import androidx.compose.runtime.setValue

/**
 * The door scan, on iOS: type a package's code and add it. Reported crashing the app (sigabrt) on the
 * iOS simulator, and not on Android - so it runs where it failed.
 */
@OptIn(ExperimentalTestApi::class)
class DoorScanTypedCodeIosTest {
    private val drop = Drop(
        "d1", "EF-1", "Alex Smith", "12 Swan Street, Richmond VIC 3121", null,
        listOf(DropPackage("EF-1", 1, packageCode = "5MQKVF"), DropPackage("EF-1", 1, packageCode = "P2N8RT")),
        DropStatus.OUT_FOR_DELIVERY,
    )
    private val run = DeliveryRun("r1", "active", listOf(DropSummary("d1", 1, "EF-1", "Richmond", 2, DropStatus.OUT_FOR_DELIVERY, street = "12 Swan Street")))

    @Test fun typing_a_code_at_the_door_adds_the_package() = runComposeUiTest {
        setContent {
            DropScreen(
                DeliveryUiState(run = run, drop = drop), "Effy Hub", {}, {}, {}, { _, _, _, _ -> }, { _, _ -> }, {}, {}, {}, {}, null,
                startScanning = true,
            )
        }
        onNodeWithText("Type a code").performClick()
        waitForIdle()
        onNode(hasSetTextAction()).performTextInput("5MQKVF")
        waitForIdle()
        onNodeWithText("Add package").performClick()
        waitForIdle()
        onNodeWithText("Packages · 1 of 2 scanned", substring = true).assertExists()
    }

    /** A paired Bluetooth scanner: key presses, no tap - the package counts, as a scan. */
    @Test fun a_paired_scanner_reads_a_label() = runComposeUiTest {
        setContent {
            DropScreen(
                DeliveryUiState(run = run, drop = drop), "Effy Hub", {}, {}, {}, { _, _, _, _ -> }, { _, _ -> }, {}, {}, {}, {}, null,
                startScanning = true,
            )
        }
        waitForIdle()
        onNode(androidx.compose.ui.test.isFocused()).assertExists() // the screen holds the keyboard
        onRoot().performKeyInput {
            fun press(k: Key) { keyDown(k); keyUp(k) }
            press(Key.E); press(Key.F); press(Key.Y); press(Key.One)
            withKeyDown(Key.ShiftLeft) { press(Key.Semicolon) }
            press(Key.Five); press(Key.M); press(Key.Q); press(Key.K); press(Key.V); press(Key.F)
            press(Key.Enter)
        }
        waitForIdle()
        onNodeWithText("Packages · 1 of 2 scanned", substring = true).assertExists()
        onNodeWithText("Scanned").assertExists()
    }

    /** The scanner fires while the type-a-code box is open: it counts as a scan, and the sheet closes. */
    @Test fun a_scan_into_the_type_a_code_box_counts() = runComposeUiTest {
        setContent {
            DropScreen(
                DeliveryUiState(run = run, drop = drop), "Effy Hub", {}, {}, {}, { _, _, _, _ -> }, { _, _ -> }, {}, {}, {}, {}, null,
                startScanning = true,
            )
        }
        onNodeWithText("Type a code").performClick(); waitForIdle()
        onNode(hasSetTextAction()).performTextInput("EFY1:5MQKVF"); waitForIdle()
        onNodeWithText("Packages · 1 of 2 scanned", substring = true).assertExists()
        onNodeWithText("Add package").assertDoesNotExist()
    }

    /** Every banner the camera box can show, on iOS: counted, already scanned, not a code, not yours. */
    @Test fun every_scan_banner_draws() = runComposeUiTest {
        setContent {
            DropScreen(
                DeliveryUiState(run = run, drop = drop), "Effy Hub", {}, {}, {}, { _, _, _, _ -> }, { _, _ -> }, {}, {}, {}, {}, null,
                startScanning = true,
            )
        }
        fun type(code: String) {
            onNodeWithText("Type a code").performClick(); waitForIdle()
            onNode(hasSetTextAction()).performTextInput(code); waitForIdle()
            onNodeWithText("Add package").performClick(); waitForIdle()
        }
        type("5MQKVF") // counted
        type("5MQKVF") // already scanned
        onNodeWithText("Already scanned").assertExists()
        type("ZZZZZ9") // not on this driver's work
        type("P2N8RT") // the last one: the green bar
        waitForIdle()
    }

    /** The drop with its hand-over, Delivered and Not delivered - the other `when`s over a maybe-null type. */
    @Test fun the_drop_and_its_results_draw() = runComposeUiTest {
        var state by androidx.compose.runtime.mutableStateOf(
            DeliveryUiState(run = run, drop = drop.copy(handover = com.effyshopping.driver.mobile.features.delivery.domain.Handover.LeaveAtDoor)),
        )
        setContent { DropScreen(state, "Effy Hub", {}, {}, {}, { _, _, _, _ -> }, { _, _ -> }, {}, {}, {}, {}, null) }
        onNodeWithText("Scan to deliver", substring = true).assertExists()
        state = state.copy(delivered = true, deliveredWith = com.effyshopping.driver.mobile.features.delivery.domain.ProofMethod.CONTACTLESS, deliveredAtEpochMillis = 0L, deliveredNote = "Left at: Front door")
        waitForIdle()
        onNodeWithText("Delivered").assertExists()
        state = state.copy(delivered = false, deliveredWith = null, failed = true, failedReason = com.effyshopping.driver.mobile.features.delivery.domain.FailureReason.NOBODY_HOME)
        waitForIdle()
        onNodeWithText("Not delivered").assertExists()
    }
}
