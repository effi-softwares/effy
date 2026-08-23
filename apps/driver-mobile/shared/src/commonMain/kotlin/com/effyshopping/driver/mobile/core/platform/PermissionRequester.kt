package com.effyshopping.driver.mobile.core.platform

import androidx.compose.runtime.Composable

/**
 * Request the app's core OS permissions — location, notifications, camera (049 US1 FR-004). Returns a
 * launch lambda; [onDone] fires once the OS prompts have been answered (whatever the outcome — priming
 * never blocks on a grant). `expect/actual` because each platform requests permissions differently.
 */
@Composable
expect fun rememberCorePermissionRequester(onDone: () -> Unit): () -> Unit
