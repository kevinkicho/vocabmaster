package com.vocabmaster.app

import android.annotation.SuppressLint
import android.app.Activity
import android.os.Bundle
import android.util.Log
import android.webkit.JavascriptInterface
import android.webkit.WebChromeClient
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceError
import java.util.Base64
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

class MainActivity : Activity() {
    companion object {
        private const val TAG = "VocabMaster"
        private const val ONLINE_URL = "https://vocabmaster112225.web.app/"
        private const val OFFLINE_URL = "file:///android_asset/index.html"
        private const val ONLINE_TIMEOUT_MS = 8000L
    }

    private lateinit var webView: WebView
    private lateinit var ttsBridge: TTSBridge
    private var isOnlineMode = false
    private var loadJob: Job? = null

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        ttsBridge = TTSBridge.getInstance(this)

        webView = findViewById(R.id.webview)
        setupWebView()

        ttsBridge.callbackHandler = { callbackId, json ->
            runOnUiThread {
                val encoded = Base64.getEncoder().encodeToString(json.toByteArray(Charsets.UTF_8))
                webView.evaluateJavascript(
                    "__nativeTTSBridge._onResultEncoded('$callbackId', '$encoded')",
                    null
                )
            }
        }

        loadOnlineFirstWithFallback()
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun setupWebView() {
        val settings: WebSettings = webView.settings
        settings.javaScriptEnabled = true
        settings.domStorageEnabled = true
        settings.allowFileAccess = true
        settings.allowFileAccessFromFileURLs = true
        settings.allowUniversalAccessFromFileURLs = true
        settings.mediaPlaybackRequiresUserGesture = false
        settings.mixedContentMode = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
        settings.userAgentString = settings.userAgentString + " VocabMasterApp/1.0"

        webView.webViewClient = object : WebViewClient() {
            override fun onReceivedError(view: WebView?, request: WebResourceRequest?, error: WebResourceError?) {
                super.onReceivedError(view, request, error)
                Log.w(TAG, "WebView error: ${error?.description} (code: ${error?.errorCode})")
                if (!isOnlineMode && request?.url?.toString()?.startsWith("https://") == true) {
                    // Online load failed, will fallback via timeout
                }
            }

            override fun onPageFinished(view: WebView?, url: String?) {
                super.onPageFinished(view, url)
                Log.d(TAG, "Page loaded: $url")
                if (url?.startsWith("https://") == true) {
                    isOnlineMode = true
                    loadJob?.cancel()
                }
            }
        }
        webView.webChromeClient = WebChromeClient()

        webView.addJavascriptInterface(NativeTTSJSInterface(), "NativeTTS")
    }

    private fun loadOnlineFirstWithFallback() {
        // Load local assets first (fast, no CORS, no cache issues)
        // Online is available for updates but local is the primary source
        webView.loadUrl(OFFLINE_URL)
    }

    inner class NativeTTSJSInterface {
        @JavascriptInterface
        fun getVoices(): String {
            Log.d(TAG, "NativeTTS.getVoices called from JS")
            return ttsBridge.getVoices()
        }

        @JavascriptInterface
        fun speak(text: String, voiceName: String, langTag: String, rate: Float, callbackId: String) {
            Log.d(TAG, "NativeTTS.speak: text='$text' voice='$voiceName' lang='$langTag'")
            ttsBridge.speak(text, voiceName, langTag, rate, callbackId)
        }

        @JavascriptInterface
        fun stop() {
            ttsBridge.stop()
        }

        @JavascriptInterface
        fun previewVoice(voiceName: String, langTag: String, callbackId: String) {
            Log.d(TAG, "NativeTTS.previewVoice: voice=$voiceName lang=$langTag")
            ttsBridge.previewVoice(voiceName, langTag, callbackId)
        }
    }

    override fun onDestroy() {
        loadJob?.cancel()
        ttsBridge.destroy()
        webView.destroy()
        super.onDestroy()
    }
}
