package com.effyshopping.driver.mobile.core.platform

import androidx.compose.ui.graphics.ImageBitmap

/** Encode a Compose [ImageBitmap] to PNG bytes (049 US2 — signature proof). Platform image encoders. */
expect fun ImageBitmap.toPngBytes(): ByteArray
