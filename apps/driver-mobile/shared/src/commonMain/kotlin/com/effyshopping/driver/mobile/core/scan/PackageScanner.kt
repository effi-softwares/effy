package com.effyshopping.driver.mobile.core.scan

import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.Modifier
import com.effyshopping.driver.mobile.core.presentation.nowEpochMillis

/** Why the camera cannot read labels — the screen then offers ticking by hand. */
enum class ScannerUnavailable { PERMISSION_REFUSED, NO_CAMERA }

/**
 * A live camera view that reads package labels continuously (driver backlog H4). Reads only QR
 * and Code 128; reports each label's code (never the raw value), at most once per two seconds while it
 * stays in view; anything that is not an Effy label is dropped before [onCode] — a product's barcode in
 * view never reaches the screen.
 *
 * It draws only the camera. The frame, the checklist, the flash and the sounds belong to each scanning
 * screen (the redesign). Camera permission is asked by the permission screen; when it is refused, or
 * there is no camera, [onUnavailable] is called and nothing is drawn.
 */
@Composable
expect fun PackageScanner(
    modifier: Modifier,
    torchOn: Boolean,
    onCode: (String) -> Unit,
    onUnavailable: (ScannerUnavailable) -> Unit,
)

/** The platform readers hand every raw value here: labels only, debounced, then [onCode]. */
@Composable
internal fun rememberLabelReads(onCode: (String) -> Unit): (String) -> Unit {
    val latest = rememberUpdatedState(onCode)
    val debouncer = remember { ReadDebouncer() }
    return remember {
        { raw: String ->
            val code = PackageToken.parse(raw)
            if (code != null && debouncer.accept(code, nowEpochMillis())) latest.value(code)
        }
    }
}
