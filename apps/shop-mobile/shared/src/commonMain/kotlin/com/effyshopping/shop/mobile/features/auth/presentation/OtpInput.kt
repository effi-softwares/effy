package com.effyshopping.shop.mobile.features.auth.presentation

import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier

/** One logical email-code editor. Platform adapters keep a single accessibility/focus node. */
@Composable
expect fun OtpInput(
    value: String,
    onValueChange: (String) -> Unit,
    onSubmit: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    isError: Boolean = false,
)
