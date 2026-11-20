package com.adesh.trackflow.liveness

import android.os.SystemClock
import androidx.annotation.OptIn
import androidx.camera.core.ExperimentalGetImage
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.ImageProxy
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.face.Face
import com.google.mlkit.vision.face.FaceDetection
import com.google.mlkit.vision.face.FaceDetector
import com.google.mlkit.vision.face.FaceDetectorOptions
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.math.abs
import kotlin.random.Random

enum class LivenessStep(val key: String) {
  EYE_BLINK("eye_blink"),
  SMILE("smile")
}

data class LivenessFrameState(
  val code: String,
  val title: String,
  val subtitle: String,
  val stepIndex: Int,
  val totalSteps: Int,
  val faceDetected: Boolean,
  val isWarning: Boolean,
  val verified: Boolean,
  val readyToSnap: Boolean,
  val stepsCompleted: List<String>,
  val durationMs: Long
)

class LivenessAnalyzer(
  private val onStateUpdate: (LivenessFrameState) -> Unit
) : ImageAnalysis.Analyzer {

  companion object {
    // Hardware calibration thresholds for real front cameras
    private const val EYE_OPEN_THRESHOLD = 0.68f
    private const val EYE_CLOSED_THRESHOLD = 0.28f
    private const val MIN_BLINK_DURATION_MS = 35L
    private const val MAX_BLINK_DURATION_MS = 850L

    private const val SMILE_NEUTRAL_MAX = 0.35f
    private const val SMILE_ACTIVE_MIN = 0.72f
    private const val SMILE_REQUIRED_FRAMES = 3

    private const val MIN_FACE_WIDTH_RATIO = 0.22f
    private const val MAX_CENTER_OFFSET_RATIO = 0.24f
    private const val MAX_YAW_DEG = 24f
    private const val MAX_PITCH_DEG = 22f
    private const val MIN_LUMA = 32.0
    private const val MAX_LUMA = 240.0
    private const val MIN_FRAME_INTERVAL_MS = 55L
  }

  private val detector: FaceDetector = FaceDetection.getClient(
    FaceDetectorOptions.Builder()
      .setPerformanceMode(FaceDetectorOptions.PERFORMANCE_MODE_FAST)
      .setClassificationMode(FaceDetectorOptions.CLASSIFICATION_MODE_ALL)
      .setMinFaceSize(MIN_FACE_WIDTH_RATIO)
      .enableTracking()
      .build()
  )

  private val isBusy = AtomicBoolean(false)
  private val isClosed = AtomicBoolean(false)
  private var lastAnalyzedAtMs = 0L

  @Volatile private var steps: List<LivenessStep> = createRandomizedSteps()
  private var sessionStartedAtMs = SystemClock.elapsedRealtime()
  private var lockedTrackingId: Int? = null
  private var currentStepIndex = 0

  // Blink state
  private var openBaselineFrames = 0
  private var eyesClosedAtMs: Long? = null

  // Smile state
  private var observedNeutralOnFace = false
  private var activeSmileFrames = 0

  // Post-verification photo gate
  private var verifiedAtMs: Long? = null
  private var snapTriggered = false

  private fun createRandomizedSteps(): List<LivenessStep> {
    // Strictly ONLY Eye Blink and Smile — randomized order to block pre-timed replays
    return if (Random.nextBoolean()) {
      listOf(LivenessStep.EYE_BLINK, LivenessStep.SMILE)
    } else {
      listOf(LivenessStep.SMILE, LivenessStep.EYE_BLINK)
    }
  }

  @Synchronized
  fun resetSession() {
    steps = createRandomizedSteps()
    sessionStartedAtMs = SystemClock.elapsedRealtime()
    lockedTrackingId = null
    currentStepIndex = 0
    resetStepCounters(clearNeutralObservation = true)
    verifiedAtMs = null
    snapTriggered = false
  }

  private fun resetStepCounters(clearNeutralObservation: Boolean) {
    openBaselineFrames = 0
    eyesClosedAtMs = null
    activeSmileFrames = 0
    if (clearNeutralObservation) {
      observedNeutralOnFace = false
    }
  }

  fun close() {
    if (isClosed.compareAndSet(false, true)) {
      try {
        detector.close()
      } catch (_: Exception) {}
    }
  }

  @OptIn(ExperimentalGetImage::class)
  override fun analyze(imageProxy: ImageProxy) {
    if (isClosed.get()) {
      imageProxy.close()
      return
    }

    val now = SystemClock.elapsedRealtime()
    val mediaImage = imageProxy.image
    if (mediaImage == null || now - lastAnalyzedAtMs < MIN_FRAME_INTERVAL_MS || !isBusy.compareAndSet(false, true)) {
      imageProxy.close()
      return
    }
    lastAnalyzedAtMs = now

    val rotation = imageProxy.imageInfo.rotationDegrees
    val uprightWidth = if (rotation == 90 || rotation == 270) imageProxy.height else imageProxy.width
    val uprightHeight = if (rotation == 90 || rotation == 270) imageProxy.width else imageProxy.height
    val avgLuma = sampleCenterLuma(imageProxy)

    val inputImage = InputImage.fromMediaImage(mediaImage, rotation)
    detector.process(inputImage)
      .addOnSuccessListener { faces ->
        if (!isClosed.get()) {
          processDetectedFaces(faces, uprightWidth, uprightHeight, avgLuma, SystemClock.elapsedRealtime())
        }
      }
      .addOnCompleteListener {
        imageProxy.close()
        isBusy.set(false)
      }
  }

  @Synchronized
  private fun processDetectedFaces(
    faces: List<Face>,
    frameWidth: Int,
    frameHeight: Int,
    avgLuma: Double,
    nowMs: Long
  ) {
    if (snapTriggered) return

    val elapsedMs = nowMs - sessionStartedAtMs
    val completedList = steps.take(currentStepIndex).map { it.key }

    if (avgLuma < MIN_LUMA) {
      emit("LIVENESS_TOO_DARK", "Move to a brighter place", "Face lighting is too dim for verification", false, true)
      return
    }
    if (avgLuma > MAX_LUMA) {
      emit("LIVENESS_TOO_BRIGHT", "Avoid harsh backlight", "Step away from direct bright light", false, true)
      return
    }

    if (faces.isEmpty()) {
      if (lockedTrackingId != null && verifiedAtMs == null) {
        lockedTrackingId = null
        currentStepIndex = 0
        resetStepCounters(clearNeutralObservation = true)
      }
      emit("LIVENESS_NO_FACE", "Position your face in the circle", "Keep your full face clearly visible", false, true)
      return
    }

    if (faces.size > 1) {
      lockedTrackingId = null
      currentStepIndex = 0
      resetStepCounters(clearNeutralObservation = true)
      emit("LIVENESS_MULTIPLE_FACES", "Only one face allowed", "Make sure nobody else is in the camera frame", false, true)
      return
    }

    val face = faces[0]
    val trackingId = face.trackingId
    if (trackingId != null) {
      if (lockedTrackingId == null) {
        lockedTrackingId = trackingId
      } else if (lockedTrackingId != trackingId) {
        // Face swapped mid-verification (anti-photo swap guard)
        lockedTrackingId = trackingId
        currentStepIndex = 0
        resetStepCounters(clearNeutralObservation = true)
        emit("LIVENESS_FACE_CHANGED", "Face changed — restarting check", "Keep your face steady inside the circle", true, true)
        return
      }
    }

    val box = face.boundingBox
    val faceWidthRatio = box.width().toFloat() / frameWidth.coerceAtLeast(1).toFloat()
    val centerOffsetX = abs((box.exactCenterX() / frameWidth.coerceAtLeast(1).toFloat()) - 0.5f)
    val centerOffsetY = abs((box.exactCenterY() / frameHeight.coerceAtLeast(1).toFloat()) - 0.47f)

    if (faceWidthRatio < MIN_FACE_WIDTH_RATIO) {
      emit("LIVENESS_FACE_OUT_OF_POSITION", "Move slightly closer", "Fill the circle with your face", true, true)
      return
    }
    if (centerOffsetX > MAX_CENTER_OFFSET_RATIO || centerOffsetY > MAX_CENTER_OFFSET_RATIO) {
      emit("LIVENESS_FACE_OUT_OF_POSITION", "Center your face in the circle", "Hold the phone at eye level", true, true)
      return
    }
    if (abs(face.headEulerAngleY) > MAX_YAW_DEG || abs(face.headEulerAngleX) > MAX_PITCH_DEG) {
      emit("LIVENESS_FACE_OUT_OF_POSITION", "Look straight at the camera", "Keep your head facing forward", true, true)
      return
    }

    val leftEye = face.leftEyeOpenProbability ?: -1f
    val rightEye = face.rightEyeOpenProbability ?: -1f
    val smile = face.smilingProbability ?: -1f

    if (smile in 0f..SMILE_NEUTRAL_MAX) {
      observedNeutralOnFace = true
    }

    // Already verified both steps -> wait briefly for open eyes so auto-captured photo is crisp
    val verifiedStamp = verifiedAtMs
    if (verifiedStamp != null) {
      val waitElapsed = nowMs - verifiedStamp
      val eyesOpenReady = leftEye >= EYE_OPEN_THRESHOLD && rightEye >= EYE_OPEN_THRESHOLD
      if (waitElapsed >= 220L && (eyesOpenReady || waitElapsed >= 750L)) {
        snapTriggered = true
        onStateUpdate(
          LivenessFrameState(
            code = "LIVENESS_VERIFIED",
            title = "Verified ✓",
            subtitle = "Capturing your photo...",
            stepIndex = steps.size,
            totalSteps = steps.size,
            faceDetected = true,
            isWarning = false,
            verified = true,
            readyToSnap = true,
            stepsCompleted = steps.map { it.key },
            durationMs = elapsedMs
          )
        )
      }
      return
    }

    val activeStep = steps[currentStepIndex]
    when (activeStep) {
      LivenessStep.EYE_BLINK -> evaluateBlinkStep(leftEye, rightEye, nowMs, elapsedMs)
      LivenessStep.SMILE -> evaluateSmileStep(leftEye, rightEye, smile, nowMs, elapsedMs)
    }
  }

  private fun evaluateBlinkStep(leftEye: Float, rightEye: Float, nowMs: Long, elapsedMs: Long) {
    val closedStamp = eyesClosedAtMs
    if (closedStamp == null) {
      if (leftEye >= EYE_OPEN_THRESHOLD && rightEye >= EYE_OPEN_THRESHOLD) {
        openBaselineFrames += 1
      } else if (openBaselineFrames >= 2 && leftEye in 0f..EYE_CLOSED_THRESHOLD && rightEye in 0f..EYE_CLOSED_THRESHOLD) {
        eyesClosedAtMs = nowMs
      }
      val prompt = if (currentStepIndex == 0) "Blink your eyes naturally" else "Great! Now blink your eyes"
      emit("LIVENESS_IN_PROGRESS", prompt, "Step ${currentStepIndex + 1} of ${steps.size}", true, false)
    } else {
      val closedDuration = nowMs - closedStamp
      if (closedDuration > MAX_BLINK_DURATION_MS) {
        eyesClosedAtMs = null
        openBaselineFrames = 0
        emit("LIVENESS_IN_PROGRESS", "Open your eyes and blink naturally", "Do not hold your eyes closed", true, true)
      } else if (closedDuration >= MIN_BLINK_DURATION_MS && leftEye >= EYE_OPEN_THRESHOLD && rightEye >= EYE_OPEN_THRESHOLD) {
        advanceStep(nowMs, elapsedMs)
      } else {
        val prompt = if (currentStepIndex == 0) "Blink your eyes naturally" else "Great! Now blink your eyes"
        emit("LIVENESS_IN_PROGRESS", prompt, "Step ${currentStepIndex + 1} of ${steps.size}", true, false)
      }
    }
  }

  private fun evaluateSmileStep(leftEye: Float, rightEye: Float, smile: Float, nowMs: Long, elapsedMs: Long) {
    if (!observedNeutralOnFace) {
      activeSmileFrames = 0
      emit("LIVENESS_IN_PROGRESS", "Relax your face briefly, then smile", "Checking natural expression", true, false)
      return
    }

    if (smile >= SMILE_ACTIVE_MIN && leftEye >= 0.50f && rightEye >= 0.50f) {
      activeSmileFrames += 1
      if (activeSmileFrames >= SMILE_REQUIRED_FRAMES) {
        advanceStep(nowMs, elapsedMs)
        return
      }
    } else {
      activeSmileFrames = 0
    }

    val prompt = if (currentStepIndex == 0) "Smile naturally" else "Great! Now smile naturally"
    emit("LIVENESS_IN_PROGRESS", prompt, "Step ${currentStepIndex + 1} of ${steps.size}", true, false)
  }

  private fun advanceStep(nowMs: Long, elapsedMs: Long) {
    currentStepIndex += 1
    resetStepCounters(clearNeutralObservation = false)

    if (currentStepIndex >= steps.size) {
      verifiedAtMs = nowMs
      onStateUpdate(
        LivenessFrameState(
          code = "LIVENESS_VERIFIED",
          title = "Verified ✓",
          subtitle = "Hold steady — capturing photo...",
          stepIndex = steps.size,
          totalSteps = steps.size,
          faceDetected = true,
          isWarning = false,
          verified = true,
          readyToSnap = false,
          stepsCompleted = steps.map { it.key },
          durationMs = elapsedMs
        )
      )
    } else {
      val nextPrompt = when (steps[currentStepIndex]) {
        LivenessStep.EYE_BLINK -> "Great! Now blink your eyes"
        LivenessStep.SMILE -> "Great! Now smile naturally"
      }
      emit("LIVENESS_IN_PROGRESS", nextPrompt, "Step ${currentStepIndex + 1} of ${steps.size}", true, false)
    }
  }

  private fun emit(code: String, title: String, subtitle: String, faceDetected: Boolean, isWarning: Boolean) {
    onStateUpdate(
      LivenessFrameState(
        code = code,
        title = title,
        subtitle = subtitle,
        stepIndex = currentStepIndex,
        totalSteps = steps.size,
        faceDetected = faceDetected,
        isWarning = isWarning,
        verified = false,
        readyToSnap = false,
        stepsCompleted = steps.take(currentStepIndex).map { it.key },
        durationMs = SystemClock.elapsedRealtime() - sessionStartedAtMs
      )
    )
  }

  private fun sampleCenterLuma(proxy: ImageProxy): Double {
    return try {
      val plane = proxy.planes.firstOrNull() ?: return 128.0
      val buffer = plane.buffer
      val rowStride = plane.rowStride
      val pixelStride = plane.pixelStride
      val w = proxy.width
      val h = proxy.height
      if (w <= 0 || h <= 0) return 128.0

      val startX = (w * 0.2f).toInt()
      val endX = (w * 0.8f).toInt().coerceAtLeast(startX + 1)
      val startY = (h * 0.2f).toInt()
      val endY = (h * 0.8f).toInt().coerceAtLeast(startY + 1)
      val stepX = ((endX - startX) / 10).coerceAtLeast(1)
      val stepY = ((endY - startY) / 10).coerceAtLeast(1)

      var sum = 0L
      var count = 0
      var y = startY
      while (y < endY) {
        var x = startX
        while (x < endX) {
          val index = y * rowStride + x * pixelStride
          if (index >= 0 && index < buffer.limit()) {
            sum += (buffer.get(index).toInt() and 0xFF)
            count += 1
          }
          x += stepX
        }
        y += stepY
      }
      if (count > 0) sum.toDouble() / count else 128.0
    } catch (_: Exception) {
      128.0
    }
  }
}

