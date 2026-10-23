package com.effyshopping.customer.mobile.core.platform

import androidx.compose.runtime.Composable

/**
 * Hand a file (the delivery note PDF) to the phone's own share sheet, from which the customer
 * saves it to Files, prints it or sends it. Android: a FileProvider URI and the share chooser; iOS:
 * `UIActivityViewController`. The file is written to the app's cache, never to shared storage.
 */
@Composable
expect fun rememberShareFile(): (bytes: ByteArray, fileName: String, mimeType: String) -> Unit
