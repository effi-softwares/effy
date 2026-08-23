package com.effyshopping.driver.mobile.features.delivery.presentation

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Canvas as GraphicsCanvas
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.Paint
import androidx.compose.ui.graphics.PaintingStyle
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.dp
import com.effyshopping.driver.mobile.core.platform.toPngBytes

/**
 * A draw-on-screen signature pad (049 US2, FR-025). Strokes are captured as paths; Confirm renders them
 * into an offscreen [ImageBitmap] and hands PNG bytes up. Clear resets. Monochrome (Principle V).
 */
@Composable
fun SignaturePad(
    working: Boolean,
    onConfirm: (ByteArray) -> Unit,
    onBack: () -> Unit,
) {
    // Each stroke is a list of points; a list of strokes lets Clear wipe everything and Confirm redraw.
    val strokes = remember { mutableStateListOf<MutableList<Offset>>() }
    var canvasSize by remember { mutableStateOf(IntSize.Zero) }
    val strokeColor = MaterialTheme.colorScheme.onSurface

    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Text("Sign below", style = MaterialTheme.typography.titleMedium)
        Canvas(
            modifier = Modifier
                .fillMaxWidth()
                .height(220.dp)
                .clip(RoundedCornerShape(12.dp))
                .background(MaterialTheme.colorScheme.surfaceVariant)
                .onSizeChanged { canvasSize = it }
                .pointerInput(Unit) {
                    detectDragGestures(
                        onDragStart = { offset -> strokes.add(mutableListOf(offset)) },
                        onDrag = { change, _ -> strokes.lastOrNull()?.add(change.position) },
                    )
                },
        ) {
            strokes.forEach { pts ->
                if (pts.size > 1) {
                    val path = Path().apply {
                        moveTo(pts.first().x, pts.first().y)
                        pts.drop(1).forEach { lineTo(it.x, it.y) }
                    }
                    drawPath(path, strokeColor, style = Stroke(width = 4f, cap = StrokeCap.Round))
                }
            }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.fillMaxWidth()) {
            OutlinedButton(onClick = { strokes.clear() }, shape = RoundedCornerShape(12.dp), modifier = Modifier.weight(1f).height(50.dp)) {
                Text("Clear")
            }
            Button(
                onClick = {
                    val bytes = renderSignature(strokes, canvasSize, strokeColor)
                    if (bytes.isNotEmpty()) onConfirm(bytes)
                },
                enabled = !working && strokes.isNotEmpty() && canvasSize != IntSize.Zero,
                shape = RoundedCornerShape(12.dp),
                modifier = Modifier.weight(1f).height(50.dp),
            ) { Text("Confirm") }
        }
        TextButton(onClick = onBack) { Text("Back") }
    }
}

/** Render the captured strokes into an offscreen bitmap and encode to PNG. */
private fun renderSignature(strokes: List<List<Offset>>, size: IntSize, color: Color): ByteArray {
    if (size.width <= 0 || size.height <= 0) return ByteArray(0)
    val bitmap = ImageBitmap(size.width, size.height)
    val canvas = GraphicsCanvas(bitmap)
    canvas.drawRect(0f, 0f, size.width.toFloat(), size.height.toFloat(), Paint().apply { this.color = Color.White })
    val paint = Paint().apply {
        this.color = color
        style = PaintingStyle.Stroke
        strokeWidth = 4f
        isAntiAlias = true
        strokeCap = StrokeCap.Round
    }
    strokes.forEach { pts ->
        if (pts.size > 1) {
            val path = Path().apply {
                moveTo(pts.first().x, pts.first().y)
                pts.drop(1).forEach { lineTo(it.x, it.y) }
            }
            canvas.drawPath(path, paint)
        }
    }
    return bitmap.toPngBytes()
}
