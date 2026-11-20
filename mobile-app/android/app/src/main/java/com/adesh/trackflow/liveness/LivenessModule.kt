package com.adesh.trackflow.liveness

import android.Manifest
import android.content.pm.PackageManager
import androidx.core.content.ContextCompat
import com.facebook.react.BaseReactPackage
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.UiThreadUtil
import com.facebook.react.module.model.ReactModuleInfo
import com.facebook.react.module.model.ReactModuleInfoProvider
import java.util.concurrent.atomic.AtomicBoolean

class LivenessModule(reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  companion object {
    const val NAME = "TrackFlowLiveness"
  }

  private val sessionOpen = AtomicBoolean(false)

  override fun getName(): String = NAME

  @ReactMethod
  fun startLivenessCheck(purpose: String?, promise: Promise) {
    val activity = reactApplicationContext.currentActivity
    if (activity == null || activity.isFinishing) {
      val map = Arguments.createMap().apply {
        putBoolean("verified", false)
        putString("code", "CAMERA_UNAVAILABLE")
        putString("message", "Attendance screen is not active. Please try again.")
      }
      promise.resolve(map)
      return
    }

    val hasCameraPerm = ContextCompat.checkSelfPermission(
      reactApplicationContext,
      Manifest.permission.CAMERA
    ) == PackageManager.PERMISSION_GRANTED

    if (!hasCameraPerm) {
      val map = Arguments.createMap().apply {
        putBoolean("verified", false)
        putString("code", "CAMERA_PERMISSION_DENIED")
        putString("message", "Camera permission is required to verify live attendance.")
      }
      promise.resolve(map)
      return
    }

    if (!sessionOpen.compareAndSet(false, true)) {
      val map = Arguments.createMap().apply {
        putBoolean("verified", false)
        putString("code", "LIVENESS_ALREADY_OPEN")
        putString("message", "Live verification is already open.")
      }
      promise.resolve(map)
      return
    }

    val safePurpose = if (purpose == "punchOut") "punchOut" else "punchIn"

    UiThreadUtil.runOnUiThread {
      try {
        val dialog = LivenessDialog(activity, safePurpose) { result ->
          sessionOpen.set(false)
          val stepsArray = Arguments.createArray().apply {
            result.stepsCompleted.forEach { pushString(it) }
          }
          val response = Arguments.createMap().apply {
            putBoolean("verified", result.verified)
            putString("code", result.code)
            putString("message", result.message)
            if (result.uri != null) putString("uri", result.uri)
            if (result.base64 != null) putString("base64", result.base64)
            putDouble("capturedAt", System.currentTimeMillis().toDouble())
            putDouble("durationMs", result.durationMs.toDouble())
            putArray("stepsCompleted", stepsArray)
          }
          promise.resolve(response)
        }
        dialog.show()
      } catch (err: Exception) {
        sessionOpen.set(false)
        val map = Arguments.createMap().apply {
          putBoolean("verified", false)
          putString("code", "CAMERA_UNAVAILABLE")
          putString("message", "Could not open live verification camera: ${err.message ?: "Unknown error"}")
        }
        promise.resolve(map)
      }
    }
  }
}

class LivenessPackage : BaseReactPackage() {
  override fun getModule(name: String, reactContext: ReactApplicationContext): NativeModule? =
    if (name == LivenessModule.NAME) LivenessModule(reactContext) else null

  override fun getReactModuleInfoProvider(): ReactModuleInfoProvider = ReactModuleInfoProvider {
    mapOf(
      LivenessModule.NAME to ReactModuleInfo(
        name = LivenessModule.NAME,
        className = LivenessModule::class.java.name,
        canOverrideExistingModule = false,
        needsEagerInit = false,
        isCxxModule = false,
        isTurboModule = false
      )
    )
  }
}
