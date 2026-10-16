package com.effyshopping.driver.mobile.core.scan

import android.Manifest
import android.content.pm.PackageManager
import androidx.annotation.OptIn
import androidx.camera.core.Camera
import androidx.camera.core.CameraSelector
import androidx.camera.core.ExperimentalGetImage
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import androidx.lifecycle.compose.LocalLifecycleOwner
import com.google.mlkit.vision.barcode.BarcodeScannerOptions
import com.google.mlkit.vision.barcode.BarcodeScanning
import com.google.mlkit.vision.barcode.common.Barcode
import com.google.mlkit.vision.common.InputImage
import java.util.concurrent.Executors

/**
 * Android: CameraX frames into ML Kit's bundled barcode model (works offline from first launch),
 * restricted to QR and Code 128 so a product's EAN in view is never even decoded.
 *
 * ⚠ Bound to the composable's lifetime, like the photo viewfinder: leaving the screen releases the
 * camera, or it would stay open behind the app for the rest of a shift.
 */
@OptIn(ExperimentalGetImage::class)
@Composable
actual fun PackageScanner(
    modifier: Modifier,
    torchOn: Boolean,
    onCode: (String) -> Unit,
    onUnavailable: (ScannerUnavailable) -> Unit,
) {
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current
    val unavailable by rememberUpdatedState(onUnavailable)
    val granted = remember {
        ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED
    }
    if (!granted) {
        LaunchedEffect(Unit) { unavailable(ScannerUnavailable.PERMISSION_REFUSED) }
        return
    }

    val handle = rememberLabelReads(onCode)
    val previewView = remember { PreviewView(context) }
    var camera by remember { mutableStateOf<Camera?>(null) }

    DisposableEffect(lifecycleOwner) {
        val worker = Executors.newSingleThreadExecutor()
        val main = ContextCompat.getMainExecutor(context)
        val scanner = BarcodeScanning.getClient(
            BarcodeScannerOptions.Builder().setBarcodeFormats(Barcode.FORMAT_QR_CODE, Barcode.FORMAT_CODE_128).build(),
        )
        val analysis = ImageAnalysis.Builder()
            .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
            .build()
        analysis.setAnalyzer(worker) { proxy ->
            val media = proxy.image
            if (media == null) {
                proxy.close()
                return@setAnalyzer
            }
            scanner.process(InputImage.fromMediaImage(media, proxy.imageInfo.rotationDegrees))
                .addOnSuccessListener { codes -> codes.forEach { b -> b.rawValue?.let { v -> main.execute { handle(v) } } } }
                .addOnCompleteListener { proxy.close() }
        }

        val future = ProcessCameraProvider.getInstance(context)
        future.addListener(
            {
                runCatching {
                    val provider = future.get()
                    val preview = Preview.Builder().build().apply { surfaceProvider = previewView.surfaceProvider }
                    provider.unbindAll()
                    camera = provider.bindToLifecycle(lifecycleOwner, CameraSelector.DEFAULT_BACK_CAMERA, preview, analysis)
                }.onFailure { unavailable(ScannerUnavailable.NO_CAMERA) }
            },
            main,
        )

        onDispose {
            analysis.clearAnalyzer()
            runCatching { future.get().unbindAll() }
            scanner.close()
            worker.shutdown()
            camera = null
        }
    }

    LaunchedEffect(camera, torchOn) {
        val c = camera ?: return@LaunchedEffect
        if (c.cameraInfo.hasFlashUnit()) c.cameraControl.enableTorch(torchOn)
    }

    AndroidView(factory = { previewView }, modifier = modifier)
}
