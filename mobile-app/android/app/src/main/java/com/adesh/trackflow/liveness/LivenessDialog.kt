package com.adesh.trackflow.liveness

import android.app.Activity
import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Matrix
import android.graphics.Paint
import android.graphics.Path
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.net.Uri
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.util.Base64
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.view.WindowManager
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView
import androidx.activity.ComponentDialog
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.ImageCapture
import androidx.camera.core.ImageCaptureException
import androidx.camera.core.ImageProxy
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.core.content.ContextCompat
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import java.io.ByteArrayOutputStream
import java.io.File
import java.io.FileOutputStream
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.math.max

data class LivenessCaptureResult(
  val verified: Boolean,
  val code: String,
  val message: String,
  val uri: String? = null,
  val base64: String? = null,
  val stepsCompleted: List<String> = emptyList(),
  val durationMs: Long = 0L
)

private class CircleFaceOverlayView(context: Context) : View(context) {
  private val scrimPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
    color = Color.parseColor("#B80F172A")
    style = Paint.Style.FILL
  }
  private val borderPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
    color = Color.parseColor("#6366F1")
    style = Paint.Style.STROKE
    strokeWidth = TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, 3.5f, resources.displayMetrics)
  }
  private val clipPath = Path()

  fun setRingColor(colorInt: Int) {
    if (borderPaint.color != colorInt) {
      borderPaint.color = colorInt
      invalidate()
    }
  }

  override fun onDraw(canvas: Canvas) {
    super.onDraw(canvas)
    val w = width.toFloat()
    val h = height.toFloat()
    if (w <= 0f || h <= 0f) return

    val radius = (w * 0.47f).coerceAtMost(h * 0.33f)
    val cx = w / 2f
    val cy = h * 0.40f

    clipPath.reset()
    clipPath.fillType = Path.FillType.EVEN_ODD
    clipPath.addRect(0f, 0f, w, h, Path.Direction.CW)
    clipPath.addCircle(cx, cy, radius, Path.Direction.CW)

    canvas.drawPath(clipPath, scrimPaint)
    canvas.drawCircle(cx, cy, radius, borderPaint)
  }
}

class LivenessDialog(
  private val hostActivity: Activity,
  private val purpose: String,
  private val onResult: (LivenessCaptureResult) -> Unit
) : ComponentDialog(hostActivity, android.R.style.Theme_Black_NoTitleBar_Fullscreen) {

  companion object {
    private const val SESSION_TIMEOUT_MS = 20_000L
    private const val MAX_PHOTO_DIMENSION = 960
    private const val JPEG_QUALITY = 72
  }

  private val mainHandler = Handler(Looper.getMainLooper())
  private val cameraExecutor: ExecutorService = Executors.newSingleThreadExecutor()
  private val finished = AtomicBoolean(false)
  private val photoCaptureInFlight = AtomicBoolean(false)
  private var timedOut = false

  private var cameraProvider: ProcessCameraProvider? = null
  private var imageCapture: ImageCapture? = null
  private var analyzer: LivenessAnalyzer? = null

  private lateinit var previewView: PreviewView
  private lateinit var overlayView: CircleFaceOverlayView
  private lateinit var guidanceTitleView: TextView
  private lateinit var guidanceSubtitleView: TextView
  private lateinit var retryButton: TextView

  private val timeoutRunnable = Runnable {
    if (finished.get() || photoCaptureInFlight.get()) return@Runnable
    timedOut = true
    overlayView.setRingColor(Color.parseColor("#F43F5E"))
    guidanceTitleView.text = "Verification timed out"
    guidanceSubtitleView.text = "Please complete both Blink & Smile inside the circle"
    retryButton.visibility = View.VISIBLE
  }

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    window?.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
    setCancelable(true)
    setCanceledOnTouchOutside(false)
    setOnCancelListener {
      finishWithResult(
        LivenessCaptureResult(
          verified = false,
          code = "LIVENESS_CANCELLED",
          message = "Live attendance verification was cancelled."
        )
      )
    }

    val root = buildContentView()
    setContentView(root)
    startCameraAndAnalyzer()
  }

  private fun dp(value: Float): Int =
    TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, value, context.resources.displayMetrics).toInt()

  private fun roundedBg(fillHex: String, radiusDp: Float, strokeHex: String? = null): GradientDrawable =
    GradientDrawable().apply {
      shape = GradientDrawable.RECTANGLE
      cornerRadius = dp(radiusDp).toFloat()
      setColor(Color.parseColor(fillHex))
      if (strokeHex != null) {
        setStroke(dp(1f), Color.parseColor(strokeHex))
      }
    }

  private fun buildContentView(): View {
    val root = LinearLayout(context).apply {
      orientation = LinearLayout.VERTICAL
      setBackgroundColor(Color.parseColor("#0F172A"))
      setPadding(dp(20f), dp(24f), dp(20f), dp(24f))
      layoutParams = ViewGroup.LayoutParams(
        ViewGroup.LayoutParams.MATCH_PARENT,
        ViewGroup.LayoutParams.MATCH_PARENT
      )
    }

    ViewCompat.setOnApplyWindowInsetsListener(root) { view, insets ->
      val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars())
      view.setPadding(
        dp(20f),
        bars.top + dp(14f),
        dp(20f),
        bars.bottom + dp(18f)
      )
      insets
    }

    // Top Header
    val header = LinearLayout(context).apply {
      orientation = LinearLayout.HORIZONTAL
      gravity = Gravity.CENTER_VERTICAL
      layoutParams = LinearLayout.LayoutParams(
        ViewGroup.LayoutParams.MATCH_PARENT,
        ViewGroup.LayoutParams.WRAP_CONTENT
      ).apply {
        bottomMargin = dp(16f)
      }
    }

    val headerTextWrap = LinearLayout(context).apply {
      orientation = LinearLayout.VERTICAL
      layoutParams = LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f)
    }

    val titleText = TextView(context).apply {
      text = if (purpose == "punchOut") "Punch-Out Live Check" else "Punch-In Live Check"
      setTextColor(Color.WHITE)
      setTextSize(TypedValue.COMPLEX_UNIT_SP, 20f)
      setTypeface(typeface, Typeface.BOLD)
    }

    val subText = TextView(context).apply {
      text = "Blink your eyes & smile — photo captures automatically"
      setTextColor(Color.parseColor("#94A3B8"))
      setTextSize(TypedValue.COMPLEX_UNIT_SP, 12.5f)
      setPadding(0, dp(3f), 0, 0)
    }

    headerTextWrap.addView(titleText)
    headerTextWrap.addView(subText)

    val closeBtn = TextView(context).apply {
      text = "✕"
      gravity = Gravity.CENTER
      setTextColor(Color.WHITE)
      setTextSize(TypedValue.COMPLEX_UNIT_SP, 17f)
      setTypeface(typeface, Typeface.BOLD)
      background = roundedBg("#334155", 13f)
      contentDescription = "Cancel liveness check"
      layoutParams = LinearLayout.LayoutParams(dp(42f), dp(42f))
      setOnClickListener { cancel() }
    }

    header.addView(headerTextWrap)
    header.addView(closeBtn)
    root.addView(header)

    // Camera Container
    val cameraCard = FrameLayout(context).apply {
      background = roundedBg("#1E293B", 24f)
      clipToOutline = true
      outlineProvider = android.view.ViewOutlineProvider.BACKGROUND
      layoutParams = LinearLayout.LayoutParams(
        ViewGroup.LayoutParams.MATCH_PARENT,
        0,
        1f
      )
    }

    previewView = PreviewView(context).apply {
      // COMPATIBLE uses TextureView so camera renders reliably inside a Dialog across all OEMs
      implementationMode = PreviewView.ImplementationMode.COMPATIBLE
      scaleType = PreviewView.ScaleType.FILL_CENTER
      layoutParams = FrameLayout.LayoutParams(
        ViewGroup.LayoutParams.MATCH_PARENT,
        ViewGroup.LayoutParams.MATCH_PARENT
      )
    }

    overlayView = CircleFaceOverlayView(context).apply {
      layoutParams = FrameLayout.LayoutParams(
        ViewGroup.LayoutParams.MATCH_PARENT,
        ViewGroup.LayoutParams.MATCH_PARENT
      )
    }

    val guidanceCard = LinearLayout(context).apply {
      orientation = LinearLayout.VERTICAL
      gravity = Gravity.CENTER_HORIZONTAL
      background = roundedBg("#D90F172A", 18f, "#33FFFFFF")
      setPadding(dp(16f), dp(14f), dp(16f), dp(14f))
      layoutParams = FrameLayout.LayoutParams(
        ViewGroup.LayoutParams.MATCH_PARENT,
        ViewGroup.LayoutParams.WRAP_CONTENT,
        Gravity.BOTTOM
      ).apply {
        leftMargin = dp(16f)
        rightMargin = dp(16f)
        bottomMargin = dp(20f)
      }
    }

    guidanceTitleView = TextView(context).apply {
      text = "Starting front camera..."
      gravity = Gravity.CENTER
      setTextColor(Color.WHITE)
      setTextSize(TypedValue.COMPLEX_UNIT_SP, 17f)
      setTypeface(typeface, Typeface.BOLD)
    }

    guidanceSubtitleView = TextView(context).apply {
      text = "Position your face inside the circle"
      gravity = Gravity.CENTER
      setTextColor(Color.parseColor("#CBD5E1"))
      setTextSize(TypedValue.COMPLEX_UNIT_SP, 13f)
      setPadding(0, dp(4f), 0, 0)
    }

    guidanceCard.addView(guidanceTitleView)
    guidanceCard.addView(guidanceSubtitleView)

    cameraCard.addView(previewView)
    cameraCard.addView(overlayView)
    cameraCard.addView(guidanceCard)
    root.addView(cameraCard)

    // Retry Button (shown only on timeout)
    retryButton = TextView(context).apply {
      text = "Try Again"
      gravity = Gravity.CENTER
      visibility = View.GONE
      setTextColor(Color.WHITE)
      setTextSize(TypedValue.COMPLEX_UNIT_SP, 15f)
      setTypeface(typeface, Typeface.BOLD)
      background = roundedBg("#4F46E5", 14f)
      setPadding(dp(18f), dp(14f), dp(18f), dp(14f))
      layoutParams = LinearLayout.LayoutParams(
        ViewGroup.LayoutParams.MATCH_PARENT,
        ViewGroup.LayoutParams.WRAP_CONTENT
      ).apply {
        topMargin = dp(14f)
      }
      setOnClickListener {
        timedOut = false
        visibility = View.GONE
        overlayView.setRingColor(Color.parseColor("#6366F1"))
        guidanceTitleView.text = "Position your face in the circle"
        guidanceSubtitleView.text = "Preparing live check..."
        analyzer?.resetSession()
        scheduleTimeout()
      }
    }
    root.addView(retryButton)

    // On-device privacy reassurance footer
    val footer = TextView(context).apply {
      text = "Checked 100% on-device. Only Eye Blink & Smile pass verification before capturing your photo."
      gravity = Gravity.CENTER
      setTextColor(Color.parseColor("#94A3B8"))
      setTextSize(TypedValue.COMPLEX_UNIT_SP, 11.5f)
      layoutParams = LinearLayout.LayoutParams(
        ViewGroup.LayoutParams.MATCH_PARENT,
        ViewGroup.LayoutParams.WRAP_CONTENT
      ).apply {
        topMargin = dp(14f)
      }
    }
    root.addView(footer)

    return root
  }

  private fun scheduleTimeout() {
    mainHandler.removeCallbacks(timeoutRunnable)
    mainHandler.postDelayed(timeoutRunnable, SESSION_TIMEOUT_MS)
  }

  private fun startCameraAndAnalyzer() {
    val providerFuture = ProcessCameraProvider.getInstance(hostActivity)
    providerFuture.addListener({
      if (finished.get()) return@addListener
      try {
        val provider = providerFuture.get()
        cameraProvider = provider

        val preview = Preview.Builder().build().also {
          it.surfaceProvider = previewView.surfaceProvider
        }

        val capture = ImageCapture.Builder()
          .setCaptureMode(ImageCapture.CAPTURE_MODE_MINIMIZE_LATENCY)
          .build()
        imageCapture = capture

        val faceAnalyzer = LivenessAnalyzer { state ->
          mainHandler.post { handleAnalyzerState(state) }
        }
        analyzer = faceAnalyzer

        val analysis = ImageAnalysis.Builder()
          .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
          .build()
          .also { it.setAnalyzer(cameraExecutor, faceAnalyzer) }

        provider.unbindAll()
        provider.bindToLifecycle(
          this,
          CameraSelector.DEFAULT_FRONT_CAMERA,
          preview,
          analysis,
          capture
        )
        scheduleTimeout()
      } catch (err: Exception) {
        finishWithResult(
          LivenessCaptureResult(
            verified = false,
            code = "CAMERA_UNAVAILABLE",
            message = "Could not start front camera: ${err.message ?: "Camera unavailable"}"
          )
        )
      }
    }, ContextCompat.getMainExecutor(hostActivity))
  }

  private fun handleAnalyzerState(state: LivenessFrameState) {
    if (finished.get() || timedOut) return

    if (state.verified) {
      mainHandler.removeCallbacks(timeoutRunnable)
      overlayView.setRingColor(Color.parseColor("#10B981"))
      guidanceTitleView.setTextColor(Color.parseColor("#34D399"))
      guidanceTitleView.text = state.title
      guidanceSubtitleView.text = state.subtitle

      if (state.readyToSnap && photoCaptureInFlight.compareAndSet(false, true)) {
        captureVerifiedEmployeePhoto(state.stepsCompleted, state.durationMs)
      }
      return
    }

    guidanceTitleView.setTextColor(Color.WHITE)
    guidanceTitleView.text = state.title
    guidanceSubtitleView.text = state.subtitle
    overlayView.setRingColor(
      when {
        state.isWarning -> Color.parseColor("#F59E0B")
        state.faceDetected -> Color.parseColor("#6366F1")
        else -> Color.parseColor("#64748B")
      }
    )
  }

  private fun captureVerifiedEmployeePhoto(stepsCompleted: List<String>, durationMs: Long) {
    val capture = imageCapture
    if (capture == null) {
      finishWithResult(
        LivenessCaptureResult(
          verified = false,
          code = "CAMERA_UNAVAILABLE",
          message = "Camera capture became unavailable. Please try again."
        )
      )
      return
    }

    capture.takePicture(
      cameraExecutor,
      object : ImageCapture.OnImageCapturedCallback() {
        override fun onCaptureSuccess(image: ImageProxy) {
          try {
            val rawBitmap = image.toBitmap()
            val rotation = image.imageInfo.rotationDegrees
            val processed = transformAndResizeFrontPhoto(rawBitmap, rotation)
            if (processed !== rawBitmap) {
              rawBitmap.recycle()
            }

            val outBytes = ByteArrayOutputStream()
            processed.compress(Bitmap.CompressFormat.JPEG, JPEG_QUALITY, outBytes)
            processed.recycle()
            val jpegBytes = outBytes.toByteArray()

            cleanupOldCachedSelfies(hostActivity.cacheDir)
            val outFile = File(hostActivity.cacheDir, "liveness_selfie_${System.currentTimeMillis()}.jpg")
            FileOutputStream(outFile).use { it.write(jpegBytes) }

            val base64Str = Base64.encodeToString(jpegBytes, Base64.NO_WRAP)
            finishWithResult(
              LivenessCaptureResult(
                verified = true,
                code = "LIVENESS_VERIFIED",
                message = "Live presence verified.",
                uri = Uri.fromFile(outFile).toString(),
                base64 = base64Str,
                stepsCompleted = stepsCompleted,
                durationMs = durationMs
              )
            )
          } catch (err: Exception) {
            finishWithResult(
              LivenessCaptureResult(
                verified = false,
                code = "SELFIE_CAPTURE_FAILED",
                message = "Verified live check, but photo capture failed: ${err.message ?: "Unknown error"}"
              )
            )
          } finally {
            image.close()
          }
        }

        override fun onError(exception: ImageCaptureException) {
          finishWithResult(
            LivenessCaptureResult(
              verified = false,
              code = "SELFIE_CAPTURE_FAILED",
              message = "Could not capture verified photo: ${exception.message ?: "Camera error"}"
            )
          )
        }
      }
    )
  }

  private fun transformAndResizeFrontPhoto(source: Bitmap, rotationDegrees: Int): Bitmap {
    val matrix = Matrix().apply {
      if (rotationDegrees != 0) {
        postRotate(rotationDegrees.toFloat())
      }
      // Mirror horizontally so front selfie matches live camera preview
      postScale(-1f, 1f)
    }

    val rotatedWidth = if (rotationDegrees == 90 || rotationDegrees == 270) source.height else source.width
    val rotatedHeight = if (rotationDegrees == 90 || rotationDegrees == 270) source.width else source.height
    val longest = max(rotatedWidth, rotatedHeight)
    if (longest > MAX_PHOTO_DIMENSION) {
      val scale = MAX_PHOTO_DIMENSION.toFloat() / longest.toFloat()
      matrix.postScale(scale, scale)
    }

    return Bitmap.createBitmap(source, 0, 0, source.width, source.height, matrix, true)
  }

  private fun cleanupOldCachedSelfies(cacheDir: File) {
    try {
      val cutoff = System.currentTimeMillis() - 10 * 60 * 1000L
      cacheDir.listFiles()?.forEach { file ->
        if (file.name.startsWith("liveness_selfie_") && file.lastModified() < cutoff) {
          file.delete()
        }
      }
    } catch (_: Exception) {}
  }

  private fun finishWithResult(result: LivenessCaptureResult) {
    if (!finished.compareAndSet(false, true)) return
    mainHandler.removeCallbacks(timeoutRunnable)
    analyzer?.close()
    mainHandler.post {
      try {
        cameraProvider?.unbindAll()
      } catch (_: Exception) {}
      try {
        if (isShowing) dismiss()
      } catch (_: Exception) {}
      cameraExecutor.shutdown()
      onResult(result)
    }
  }
}
