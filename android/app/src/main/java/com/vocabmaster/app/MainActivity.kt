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
import java.util.Base64

class MainActivity : Activity() {
    companion object {
        private const val TAG = "VocabMaster"
        private const val APP_PORT = 5000
        private const val APP_URL = "http://localhost:${APP_PORT}/"
    }

    private lateinit var webView: WebView
    private lateinit var ttsBridge: TTSBridge

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

        webView.loadUrl(APP_URL)
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun setupWebView() {
        val settings: WebSettings = webView.settings
        settings.javaScriptEnabled = true
        settings.domStorageEnabled = true
        settings.allowFileAccess = true
        settings.mediaPlaybackRequiresUserGesture = false
        settings.mixedContentMode = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
        settings.userAgentString = settings.userAgentString + " VocabMasterApp/1.0"

        webView.webViewClient = WebViewClient()
        webView.webChromeClient = WebChromeClient()

        webView.addJavascriptInterface(NativeTTSJSInterface(), "NativeTTS")
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
        ttsBridge.destroy()
        webView.destroy()
        super.onDestroy()
    }
}
