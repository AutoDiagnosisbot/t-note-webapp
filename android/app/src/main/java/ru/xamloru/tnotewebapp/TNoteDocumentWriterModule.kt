package ru.xamloru.tnotewebapp

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.util.Base64
import android.util.Log
import com.facebook.react.bridge.BaseActivityEventListener
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.io.File
import java.io.FileInputStream
import java.io.IOException
import java.io.InputStream

class TNoteDocumentWriterModule(
  private val reactContext: ReactApplicationContext
) : ReactContextBaseJavaModule(reactContext) {

  private var createDocumentPromise: Promise? = null

  private val activityEventListener = object : BaseActivityEventListener() {
    override fun onActivityResult(activity: Activity, requestCode: Int, resultCode: Int, data: Intent?) {
      if (requestCode != CREATE_DOCUMENT_REQUEST_CODE) {
        return
      }

      val promise = createDocumentPromise ?: return
      createDocumentPromise = null

      if (resultCode != Activity.RESULT_OK) {
        promise.resolve(null)
        return
      }

      val documentUri = data?.data
      if (documentUri == null) {
        promise.reject("android_document_uri_missing", "Document URI is missing")
        return
      }

      val grantFlags = data.flags and (Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION)
      if (grantFlags != 0) {
        try {
          reactContext.contentResolver.takePersistableUriPermission(documentUri, grantFlags)
        } catch (error: SecurityException) {
          Log.w(TAG, "Persistable document permission is unavailable for $documentUri", error)
        }
      }

      promise.resolve(documentUri.toString())
    }
  }

  init {
    reactContext.addActivityEventListener(activityEventListener)
  }

  override fun getName(): String = MODULE_NAME

  @ReactMethod
  fun createDocument(filename: String, mimeType: String, initialUri: String?, promise: Promise) {
    if (createDocumentPromise != null) {
      promise.reject("android_document_picker_busy", "Document picker is already active")
      return
    }

    val activity = reactContext.currentActivity
    if (activity == null) {
      promise.reject("android_document_activity_missing", "Current activity is unavailable")
      return
    }

    val intent = Intent(Intent.ACTION_CREATE_DOCUMENT).apply {
      addCategory(Intent.CATEGORY_OPENABLE)
      type = mimeType
      putExtra(Intent.EXTRA_TITLE, filename)
      addFlags(
        Intent.FLAG_GRANT_READ_URI_PERMISSION or
          Intent.FLAG_GRANT_WRITE_URI_PERMISSION or
          Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION
      )

      if (!initialUri.isNullOrBlank()) {
        putExtra(EXTRA_INITIAL_URI, Uri.parse(initialUri))
      }
    }

    createDocumentPromise = promise

    try {
      activity.startActivityForResult(intent, CREATE_DOCUMENT_REQUEST_CODE)
    } catch (error: Exception) {
      createDocumentPromise = null
      Log.e(TAG, "Failed to launch document picker", error)
      promise.reject("android_document_picker_failed", error.message, error)
    }
  }

  @ReactMethod
  fun writeBase64ToContentUri(contentUri: String, base64: String, promise: Promise) {
    try {
      val targetUri = Uri.parse(contentUri)
      val bytes = Base64.decode(base64, Base64.DEFAULT)

      reactContext.contentResolver.openOutputStream(targetUri, "w")?.use { output ->
        output.write(bytes)
        output.flush()
      } ?: throw IOException("Output stream is unavailable for $contentUri")

      promise.resolve(null)
    } catch (error: Exception) {
      Log.e(TAG, "Failed to write base64 to document URI", error)
      promise.reject("android_document_write_failed", error.message, error)
    }
  }

  @ReactMethod
  fun copyFileToContentUri(sourceFileUri: String, contentUri: String, promise: Promise) {
    try {
      val targetUri = Uri.parse(contentUri)
      openSourceInputStream(sourceFileUri).use { input ->
        reactContext.contentResolver.openOutputStream(targetUri, "w")?.use { output ->
          input.copyTo(output, DEFAULT_BUFFER_SIZE)
          output.flush()
        } ?: throw IOException("Output stream is unavailable for $contentUri")
      }

      promise.resolve(null)
    } catch (error: Exception) {
      Log.e(TAG, "Failed to copy file to document URI", error)
      promise.reject("android_document_copy_failed", error.message, error)
    }
  }

  private fun openSourceInputStream(sourceFileUri: String): InputStream {
    val sourceUri = Uri.parse(sourceFileUri)
    return when (sourceUri.scheme?.lowercase()) {
      null, "" -> FileInputStream(File(sourceFileUri))
      "file" -> {
        val path = sourceUri.path ?: throw IOException("File URI path is missing: $sourceFileUri")
        FileInputStream(File(path))
      }
      else -> reactContext.contentResolver.openInputStream(sourceUri)
        ?: throw IOException("Input stream is unavailable for $sourceFileUri")
    }
  }

  companion object {
    private const val CREATE_DOCUMENT_REQUEST_CODE = 43001
    private const val EXTRA_INITIAL_URI = "android.provider.extra.INITIAL_URI"
    private const val MODULE_NAME = "TNoteDocumentWriter"
    private const val TAG = "TNoteDocumentWriter"
  }
}
