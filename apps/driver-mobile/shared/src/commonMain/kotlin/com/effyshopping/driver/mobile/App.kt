package com.effyshopping.driver.mobile

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.safeContentPadding
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.tooling.preview.Preview
import com.effyshopping.driver.mobile.core.theme.EffyTheme
import org.jetbrains.compose.resources.painterResource

// 026 T025a: the resource package is now PINNED to `com.effyshopping.driver.mobile.resources` in
// shared/build.gradle.kts, matching customer-mobile and shop-mobile, because the generated
// EffyTypography.kt imports the font accessors from a package the generator has to know at emit
// time. That replaced the KMP template's auto-derived `driver_mobile.shared.generated.resources`.
import com.effyshopping.driver.mobile.resources.Res
import com.effyshopping.driver.mobile.resources.compose_multiplatform

@Composable
@Preview
fun App() {
    // Shared Effy theme (Principle V) — the same generated tokens as customer/shop/web. This base
    // template screen is a placeholder; the driver app's real surfaces are a later slice.
    EffyTheme {
        var showContent by remember { mutableStateOf(false) }
        Column(
            modifier = Modifier
                .background(MaterialTheme.colorScheme.primaryContainer)
                .safeContentPadding()
                .fillMaxSize(),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Button(onClick = { showContent = !showContent }) {
                Text("Click me!")
            }
            AnimatedVisibility(showContent) {
                val greeting = remember { Greeting().greet() }
                Column(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    Image(painterResource(Res.drawable.compose_multiplatform), null)
                    Text("Compose: $greeting")
                }
            }
        }
    }
}