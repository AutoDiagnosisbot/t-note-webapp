package ru.xamloru.tnotewebapp

import android.app.Activity
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.Build
import android.os.Bundle
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.BaseActivityEventListener
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.google.android.gms.auth.api.phone.SmsRetriever
import com.google.android.gms.common.api.CommonStatusCodes
import com.google.android.gms.common.api.Status

class TNoteOtpRetrieverModule(
  private val reactContext: ReactApplicationContext
) : ReactContextBaseJavaModule(reactContext) {
  private var smsReceiver: BroadcastReceiver? = null
  private val activityEventListener =
    object : BaseActivityEventListener() {
      override fun onActivityResult(activity: Activity, requestCode: Int, resultCode: Int, data: Intent?) {
        if (requestCode != SMS_CONSENT_REQUEST_CODE) {
          return
        }

        if (resultCode == Activity.RESULT_OK && data != null) {
          val message = data.getStringExtra(SmsRetriever.EXTRA_SMS_MESSAGE).orEmpty()
          emitEvent(status = "received", message = message, code = extractOtp(message))
        } else {
          emitEvent(status = "error", error = "SMS consent was dismissed")
        }

        unregisterReceiver()
      }
    }

  init {
    reactContext.addActivityEventListener(activityEventListener)
  }

  override fun getName(): String = NAME

  @ReactMethod
  fun startOtpListener(promise: Promise) {
    try {
      unregisterReceiver()

      val receiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
          if (intent?.action != SmsRetriever.SMS_RETRIEVED_ACTION) {
            return
          }

          val extras = intent.extras ?: return
          val status = extras.get(SmsRetriever.EXTRA_STATUS) as? Status ?: return

          when (status.statusCode) {
            CommonStatusCodes.SUCCESS -> {
              val consentIntent = getConsentIntent(extras)
              if (consentIntent != null) {
                val activity = reactApplicationContext.currentActivity
                if (activity != null) {
                  @Suppress("DEPRECATION")
                  activity.startActivityForResult(consentIntent, SMS_CONSENT_REQUEST_CODE)
                } else {
                  emitEvent(status = "error", error = "No foreground activity for SMS consent")
                  unregisterReceiver()
                }
                return
              }

              val message = extras.getString(SmsRetriever.EXTRA_SMS_MESSAGE).orEmpty()
              emitEvent(status = "received", message = message, code = extractOtp(message))
              unregisterReceiver()
            }

            CommonStatusCodes.TIMEOUT -> {
              emitEvent(status = "timeout")
              unregisterReceiver()
            }

            else -> {
              emitEvent(status = "error", error = "Unexpected SMS Retriever status: ${status.statusCode}")
              unregisterReceiver()
            }
          }
        }
      }

      registerReceiver(receiver)
      smsReceiver = receiver

      val client = SmsRetriever.getClient(reactContext)

      client.startSmsRetriever().addOnFailureListener { error ->
        emitEvent(status = "error", error = error.message ?: "Failed to start SMS retriever")
      }

      client
        .startSmsUserConsent(null)
        .addOnSuccessListener {
          promise.resolve(null)
        }
        .addOnFailureListener { error ->
          unregisterReceiver()
          emitEvent(status = "error", error = error.message ?: "Failed to start SMS User Consent")
          promise.reject("OTP_LISTENER_START_FAILED", error)
        }
    } catch (error: Exception) {
      unregisterReceiver()
      emitEvent(status = "error", error = error.message ?: "Failed to start SMS retriever")
      promise.reject("OTP_LISTENER_START_FAILED", error)
    }
  }

  @ReactMethod
  fun stopOtpListener(promise: Promise) {
    unregisterReceiver()
    promise.resolve(null)
  }

  @ReactMethod
  fun addListener(eventName: String) {
    // Required for NativeEventEmitter on Android.
  }

  @ReactMethod
  fun removeListeners(count: Double) {
    // Required for NativeEventEmitter on Android.
  }

  override fun invalidate() {
    unregisterReceiver()
    reactContext.removeActivityEventListener(activityEventListener)
    super.invalidate()
  }

  private fun registerReceiver(receiver: BroadcastReceiver) {
    val filter = IntentFilter(SmsRetriever.SMS_RETRIEVED_ACTION)

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      reactContext.registerReceiver(
        receiver,
        filter,
        SmsRetriever.SEND_PERMISSION,
        null,
        Context.RECEIVER_EXPORTED
      )
    } else {
      @Suppress("DEPRECATION")
      reactContext.registerReceiver(receiver, filter, SmsRetriever.SEND_PERMISSION, null)
    }
  }

  private fun unregisterReceiver() {
    val receiver = smsReceiver ?: return
    smsReceiver = null

    runCatching {
      reactContext.unregisterReceiver(receiver)
    }
  }

  private fun emitEvent(
    status: String,
    message: String? = null,
    code: String? = null,
    error: String? = null
  ) {
    if (!reactContext.hasActiveReactInstance()) {
      return
    }

    val payload = Arguments.createMap().apply {
      putString("status", status)
      if (message != null) {
        putString("message", message)
      }
      if (code != null) {
        putString("code", code)
      }
      if (error != null) {
        putString("error", error)
      }
    }

    reactContext
      .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
      .emit(EVENT_NAME, payload)
  }

  private fun extractOtp(message: String): String? {
    return OTP_REGEX.find(message)?.groupValues?.getOrNull(1)
  }

  private fun getConsentIntent(extras: Bundle): Intent? {
    return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      extras.getParcelable(SmsRetriever.EXTRA_CONSENT_INTENT, Intent::class.java)
    } else {
      @Suppress("DEPRECATION")
      extras.getParcelable(SmsRetriever.EXTRA_CONSENT_INTENT)
    }
  }

  companion object {
    const val NAME = "TNoteOtpRetriever"
    const val EVENT_NAME = "tnoteOtpReceived"
    private const val SMS_CONSENT_REQUEST_CODE = 10001

    private val OTP_REGEX = Regex("\\b(\\d{6})\\b")
  }
}
