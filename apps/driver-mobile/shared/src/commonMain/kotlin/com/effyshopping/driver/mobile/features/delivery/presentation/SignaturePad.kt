package com.effyshopping.driver.mobile.features.delivery.presentation

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.border
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Stable
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
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.dp
import com.effyshopping.driver.mobile.core.platform.toPngBytes
import com.effyshopping.driver.mobile.design.EffyStorefrontShape

/** The strokes of a signature being drawn; [render] turns them into a PNG. */
@Stable
class SignatureState {
    internal val strokes = mutableStateListOf<MutableList<Offset>>()
    internal var size by mutableStateOf(IntSize.Zero)

    val isEmpty: Boolean get() = strokes.none { it.size > 1 }

    fun clear() = strokes.clear()

    /**
     * The signature as a PNG — always black ink on white, whatever the appearance: it is a record
     * read later by people on other screens, and light ink drawn in dark mode would vanish on paper.
     */
    fun render(): ByteArray {
        if (size.width <= 0 || size.height <= 0 || isEmpty) return ByteArray(0)
        val bitmap = ImageBitmap(size.width, size.height)
        val canvas = GraphicsCanvas(bitmap)
        canvas.drawRect(0f, 0f, size.width.toFloat(), size.height.toFloat(), Paint().apply { color = Color.White })
        val paint = Paint().apply {
            color = Color.Black
            style = PaintingStyle.Stroke
            strokeWidth = 5f
            isAntiAlias = true
            strokeCap = StrokeCap.Round
        }
        strokes.forEach { pts -> pathOf(pts)?.let { canvas.drawPath(it, paint) } }
        return bitmap.toPngBytes()
    }
}

@Composable
fun rememberSignatureState(): SignatureState = remember { SignatureState() }

private fun pathOf(pts: List<Offset>): Path? {
    if (pts.size < 2) return null
    return Path().apply {
        moveTo(pts.first().x, pts.first().y)
        pts.drop(1).forEach { lineTo(it.x, it.y) }
    }
}

/** The box the customer signs in with a finger, with a dashed line to sign above (canvas `ProofSignature`). */
@Composable
fun SignaturePad(state: SignatureState, modifier: Modifier = Modifier) {
    val ink = MaterialTheme.colorScheme.onSurface
    val line = MaterialTheme.colorScheme.outline
    val shape = EffyStorefrontShape.card
    Canvas(
        modifier = modifier
            .fillMaxWidth()
            .height(240.dp)
            .clip(shape)
            .border(1.dp, MaterialTheme.colorScheme.outline, shape)
            .onSizeChanged { state.size = it }
            .semantics { contentDescription = "Signature box. Sign with a finger." }
            .pointerInput(Unit) {
                detectDragGestures(
                    onDragStart = { offset -> state.strokes.add(mutableListOf(offset)) },
                    onDrag = { change, _ -> state.strokes.lastOrNull()?.add(change.position) },
                )
            },
    ) {
        val y = size.height * 0.72f
        drawLine(line, Offset(24f, y), Offset(size.width - 24f, y), strokeWidth = 2f, pathEffect = PathEffect.dashPathEffect(floatArrayOf(10f, 8f)))
        state.strokes.forEach { pts -> pathOf(pts)?.let { drawPath(it, ink, style = Stroke(width = 5f, cap = StrokeCap.Round)) } }
    }
}
