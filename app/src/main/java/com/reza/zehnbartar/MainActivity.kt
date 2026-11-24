package com.reza.zehnbartar

import android.app.Activity
import android.app.AlertDialog
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.text.InputType
import android.view.Menu
import android.view.MenuItem
import android.view.ViewGroup
import android.view.Gravity
import android.widget.Button
import android.widget.FrameLayout
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.TextView
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebView
import android.webkit.WebViewClient
import java.security.MessageDigest
import java.security.SecureRandom
import javax.crypto.SecretKeyFactory
import javax.crypto.spec.PBEKeySpec

class MainActivity : Activity() {
    private lateinit var webView: WebView
    private var fileCallback: ValueCallback<Array<Uri>>? = null
    private val filePickerRequest = 4102
    private val lockPrefs by lazy { getSharedPreferences("zb_app_lock", MODE_PRIVATE) }
    private var unlocked = false
    private var failedAttempts = 0
    private var lockoutUntil = 0L

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        webView = WebView(this)
        webView.settings.javaScriptEnabled = true
        webView.settings.domStorageEnabled = true
        webView.settings.allowFileAccess = true
        webView.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(
                view: WebView?, request: android.webkit.WebResourceRequest?
            ): Boolean {
                val url = request?.url ?: return false
                if (url.scheme == "https" || url.scheme == "http") {
                    return try {
                        startActivity(Intent(Intent.ACTION_VIEW, url))
                        true
                    } catch (_: Exception) { false }
                }
                return false
            }
        }
        webView.webChromeClient = object : WebChromeClient() {
            override fun onShowFileChooser(
                view: WebView?, callback: ValueCallback<Array<Uri>>?,
                params: FileChooserParams?
            ): Boolean {
                fileCallback?.onReceiveValue(null)
                fileCallback = callback
                val intent = params?.createIntent() ?: Intent(Intent.ACTION_GET_CONTENT).apply {
                    type = "*/*"
                    addCategory(Intent.CATEGORY_OPENABLE)
                }
                return try {
                    startActivityForResult(intent, filePickerRequest)
                    true
                } catch (_: Exception) {
                    fileCallback = null
                    false
                }
            }
        }
        val root = FrameLayout(this)
        root.addView(webView, FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT
        ))
        val lockButton = Button(this).apply {
            text = "قفل"
            textSize = 11f
            setOnClickListener { unlocked = false; showLockGate() }
        }
        val lockParams = FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT,
            Gravity.TOP or Gravity.END
        ).apply { topMargin = 10; marginEnd = 10 }
        root.addView(lockButton, lockParams)
        setContentView(root)
        if (savedInstanceState == null) {
            webView.loadUrl("file:///android_asset/index.html")
        } else {
            webView.restoreState(savedInstanceState)
        }
        showLockGate()
    }

    override fun onCreateOptionsMenu(menu: Menu): Boolean {
        menu.add(0, 1, 0, "قفل برنامه")
        menu.add(0, 2, 1, "تغییر رمز برنامه")
        return true
    }

    override fun onOptionsItemSelected(item: MenuItem): Boolean {
        when (item.itemId) {
            1 -> { unlocked = false; showLockGate(); return true }
            2 -> { if (unlocked) changePin() else showLockGate(); return true }
        }
        return super.onOptionsItemSelected(item)
    }

    private fun showLockGate() {
        if (isFinishing) return
        val hasPin = lockPrefs.contains("hash") && lockPrefs.contains("salt")
        val field = EditText(this).apply {
            inputType = InputType.TYPE_CLASS_NUMBER or InputType.TYPE_NUMBER_VARIATION_PASSWORD
            hint = if (hasPin) "رمز ۶ تا ۱۲ رقمی" else "یک رمز ۶ تا ۱۲ رقمی تعیین کن"
        }
        val wrap = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(48, 12, 48, 0)
            addView(TextView(this@MainActivity).apply {
                text = if (hasPin) "برای ورود رمز برنامه را وارد کن." else "برای محافظت از برنامه یک رمز محلی تعیین کن."
            })
            addView(field, LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT
            ))
        }
        val dialog = AlertDialog.Builder(this)
            .setTitle(if (hasPin) "قفل ذهن برتر" else "تنظیم قفل شخصی")
            .setView(wrap)
            .setCancelable(false)
            .setPositiveButton(if (hasPin) "ورود" else "ذخیره رمز", null)
            .create()
        dialog.setOnShowListener {
            dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener {
                val pin = field.text.toString()
                if (System.currentTimeMillis() < lockoutUntil) {
                    field.error = "چند لحظه بعد دوباره تلاش کن."
                    return@setOnClickListener
                }
                if (!hasPin) {
                    if (!pin.matches(Regex("\\d{6,12}"))) {
                        field.error = "رمز باید ۶ تا ۱۲ رقم باشد."
                        return@setOnClickListener
                    }
                    savePin(pin)
                    failedAttempts = 0
                    unlocked = true
                    dialog.dismiss()
                } else if (verifyPin(pin)) {
                    failedAttempts = 0
                    unlocked = true
                    dialog.dismiss()
                } else {
                    failedAttempts++
                    if (failedAttempts >= 5) {
                        lockoutUntil = System.currentTimeMillis() + 30_000
                        failedAttempts = 0
                    }
                    field.text.clear()
                    field.error = "رمز نادرست است."
                }
            }
        }
        dialog.show()
    }

    private fun changePin() {
        val oldField = EditText(this).apply {
            inputType = InputType.TYPE_CLASS_NUMBER or InputType.TYPE_NUMBER_VARIATION_PASSWORD
            hint = "رمز فعلی"
        }
        val newField = EditText(this).apply {
            inputType = InputType.TYPE_CLASS_NUMBER or InputType.TYPE_NUMBER_VARIATION_PASSWORD
            hint = "رمز جدید، ۶ تا ۱۲ رقم"
        }
        val layout = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(48, 12, 48, 0)
            addView(oldField)
            addView(newField)
        }
        AlertDialog.Builder(this).setTitle("تغییر رمز برنامه").setView(layout)
            .setNegativeButton("انصراف", null)
            .setPositiveButton("ذخیره") { _, _ ->
                val oldPin = oldField.text.toString()
                val newPin = newField.text.toString()
                if (verifyPin(oldPin) && newPin.matches(Regex("\\d{6,12}"))) {
                    savePin(newPin)
                    unlocked = true
                } else {
                    AlertDialog.Builder(this).setMessage("رمز فعلی نادرست است یا رمز جدید معتبر نیست.")
                        .setPositiveButton("باشه", null).show()
                }
            }.show()
    }

    private fun savePin(pin: String) {
        val salt = ByteArray(16).also { SecureRandom().nextBytes(it) }
        val hash = derivePin(pin, salt)
        lockPrefs.edit().putString("salt", android.util.Base64.encodeToString(salt, android.util.Base64.NO_WRAP))
            .putString("hash", android.util.Base64.encodeToString(hash, android.util.Base64.NO_WRAP))
            .apply()
    }

    private fun verifyPin(pin: String): Boolean {
        if (pin.length !in 6..12) return false
        return try {
            val salt = android.util.Base64.decode(lockPrefs.getString("salt", "")!!, android.util.Base64.NO_WRAP)
            val expected = android.util.Base64.decode(lockPrefs.getString("hash", "")!!, android.util.Base64.NO_WRAP)
            MessageDigest.isEqual(expected, derivePin(pin, salt))
        } catch (_: Exception) { false }
    }

    private fun derivePin(pin: String, salt: ByteArray): ByteArray {
        val spec = PBEKeySpec(pin.toCharArray(), salt, 210_000, 256)
        return try {
            SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256").generateSecret(spec).encoded
        } finally { spec.clearPassword() }
    }

    @Deprecated("Deprecated in Android")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode == filePickerRequest) {
            val result = if (resultCode == RESULT_OK) {
                WebChromeClient.FileChooserParams.parseResult(resultCode, data)
            } else null
            fileCallback?.onReceiveValue(result)
            fileCallback = null
        }
    }

    override fun onSaveInstanceState(outState: Bundle) {
        webView.saveState(outState)
        super.onSaveInstanceState(outState)
    }

    @Deprecated("Deprecated in Android")
    override fun onBackPressed() {
        if (webView.canGoBack()) webView.goBack() else super.onBackPressed()
    }
}