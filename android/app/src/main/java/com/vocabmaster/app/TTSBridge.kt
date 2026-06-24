package com.vocabmaster.app

import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import android.speech.tts.Voice
import android.util.Log
import android.webkit.JavascriptInterface
import kotlinx.coroutines.*
import java.util.*
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

class TTSBridge(private val context: Context) {
    companion object {
        private const val TAG = "VocabTTS"
        private var instance: TTSBridge? = null
        fun getInstance(ctx: Context): TTSBridge {
            if (instance == null) instance = TTSBridge(ctx.applicationContext)
            return instance!!
        }
    }

    private var tts: TextToSpeech? = null
    private val pendingCallbacks = mutableMapOf<String, (String?) -> Unit>()
    private val scope = CoroutineScope(Dispatchers.Main + SupervisorJob())
    private var isInitialized = false
    private val initListeners = mutableListOf<(Boolean) -> Unit>()

    var callbackHandler: ((String, String) -> Unit)? = null

    // TTS engine-to-voice mapping for accurate provider detection
    // Maps voice name → engine label (e.g. "Google TTS", "Samsung TTS")
    private val engineVoiceMap = ConcurrentHashMap<String, String>()
    @Volatile private var engineMapReady = false

    init {
        initTTS()
    }

    private fun initTTS() {
        tts?.shutdown()
        tts = TextToSpeech(context) { status ->
            isInitialized = status == TextToSpeech.SUCCESS
            Log.d(TAG, "TTS init: $status")
            initListeners.forEach { it(isInitialized) }
            initListeners.clear()
            if (isInitialized) {
                buildEngineVoiceMap()
            }
        }
    }

    fun ensureInitialized(callback: (Boolean) -> Unit) {
        if (isInitialized) {
            callback(true)
        } else {
            initListeners.add(callback)
        }
    }

    private fun heuristicProvider(v: Voice, features: String): String {
        return when {
            v.name.contains("google", ignoreCase = true) ||
                v.locale.toString().contains("google", ignoreCase = true) -> "Google"
            v.name.contains("samsung", ignoreCase = true) ||
                features.contains("samsung", ignoreCase = true) -> "Samsung"
            v.isNetworkConnectionRequired -> "Network"
            else -> "Local"
        }
    }

    private fun simplifyProviderLabel(label: String): String {
        return when {
            label.contains("Google", ignoreCase = true) -> "Google"
            label.contains("Samsung", ignoreCase = true) -> "Samsung"
            label.contains("Microsoft", ignoreCase = true) -> "Microsoft"
            label.contains("Apple", ignoreCase = true) -> "Apple"
            else -> "Local"
        }
    }

    /**
     * Enumerates ALL installed TTS engines by querying PackageManager for
     * services that handle TextToSpeech.Engine.INTENT_ACTION_TTS_SERVICE,
     * then creating a temporary TextToSpeech instance per engine and collecting
     * its voice set. This is the only reliable way to determine which engine a
     * Voice belongs to — Android's Voice class does not expose engine attribution
     * via public API.
     *
     * Runs on IO dispatcher so it doesn't block the main thread. Results stored
     * in engineVoiceMap (voice name → engine label). On first getVoices() call
     * before the map is ready, the heuristic fallback is used instead.
     */
    private fun buildEngineVoiceMap() {
        scope.launch(Dispatchers.IO) {
            try {
                val intent = Intent(TextToSpeech.Engine.INTENT_ACTION_TTS_SERVICE)
                val enginePackages = context.packageManager.queryIntentServices(intent, 0)
                Log.d(TAG, "Building engine voice map: ${enginePackages.size} engines found")
                for (info in enginePackages) {
                    val packageName = info.serviceInfo.packageName
                    val label = info.loadLabel(context.packageManager).toString()
                    val latch = CountDownLatch(1)
                    var tempVoices: Set<Voice>? = null
                    lateinit var tempTts: TextToSpeech

                    try {
                        tempTts = TextToSpeech(context, { status ->
                            if (status == TextToSpeech.SUCCESS) {
                                tempVoices = tempTts.voices
                            }
                            latch.countDown()
                        }, packageName)

                        val ready = latch.await(2, TimeUnit.SECONDS)
                        if (ready && tempVoices != null) {
                            var count = 0
                            for (v in tempVoices!!) {
                                if (v.features.contains("legacySetLanguageVoice")) continue
                                engineVoiceMap[v.name] = label
                                count++
                            }
                            Log.d(TAG, "  Engine '$label' ($packageName): $count voices")
                        }
                        tempTts.shutdown()
                    } catch (e: Exception) {
                        Log.w(TAG, "  Engine '$packageName' enumeration failed: ${e.message}")
                    }
                }
                engineMapReady = true
                Log.d(TAG, "Engine voice map built: ${engineVoiceMap.size} voices mapped to ${enginePackages.size} engines")
            } catch (e: Exception) {
                Log.e(TAG, "buildEngineVoiceMap failed", e)
            }
        }
    }

    @JavascriptInterface
    fun getVoices(): String {
        if (!isInitialized || tts == null) {
            Log.w(TAG, "TTS not initialized for getVoices")
            return "[]"
        }
        try {
            val voices: MutableSet<Voice> = tts!!.voices
            val arr = org.json.JSONArray()
            for (v in voices) {
                if (v.features.contains("legacySetLanguageVoice")) continue
                val obj = org.json.JSONObject()
                val features = v.features.joinToString(",")

                obj.put("name", v.name)
                obj.put("locale", v.locale.toLanguageTag())
                obj.put("voiceName", v.name)
                obj.put("quality", v.quality)
                obj.put("isNetwork", v.isNetworkConnectionRequired)
                obj.put("features", features)

                // Prefer engine voice map for accurate provider, fall back to heuristic
                val provider = if (engineMapReady) {
                    val label = engineVoiceMap[v.name]
                    if (label != null) simplifyProviderLabel(label)
                    else heuristicProvider(v, features)
                } else {
                    heuristicProvider(v, features)
                }
                obj.put("provider", provider)

                // User-friendly display name using locale + quality badge
                val qualityBadge = when (v.quality) {
                    Voice.QUALITY_VERY_HIGH, Voice.QUALITY_HIGH -> "★"
                    else -> ""
                }
                val displayName = "${v.locale.getDisplayName()}$qualityBadge"
                obj.put("displayName", displayName)

                arr.put(obj)
            }
            val result = arr.toString()
            Log.d(TAG, "getVoices: found ${arr.length()} voices (engineMapReady=$engineMapReady)")
            return result
        } catch (e: Exception) {
            Log.e(TAG, "getVoices error", e)
            return "[]"
        }
    }

    @JavascriptInterface
    fun speak(text: String, voiceName: String, langTag: String, rate: Float, callbackId: String) {
        ensureInitialized { ok ->
            if (!ok || tts == null) {
                resolveCallback(callbackId, """{"error":"TTS not ready"}""")
                return@ensureInitialized
            }
            try {
                val utteranceId = "utt_${UUID.randomUUID()}"
                pendingCallbacks[utteranceId] = { error ->
                    if (error != null) {
                        resolveCallback(callbackId, """{"error":"$error"}""")
                    } else {
                        resolveCallback(callbackId, """{"done":true}""")
                    }
                    pendingCallbacks.remove(utteranceId)
                }

                tts!!.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
                    override fun onStart(uttId: String?) {
                        Log.d(TAG, "TTS start: $uttId")
                    }
                    override fun onDone(uttId: String?) {
                        Log.d(TAG, "TTS done: $uttId")
                        pendingCallbacks[uttId]?.invoke(null)
                    }
                    @Deprecated("Deprecated in Java")
                    override fun onError(uttId: String?) {
                        Log.e(TAG, "TTS error: $uttId")
                        pendingCallbacks[uttId]?.invoke("TTS error")
                    }
                    override fun onError(uttId: String?, errorCode: Int) {
                        Log.e(TAG, "TTS error: $uttId code=$errorCode")
                        pendingCallbacks[uttId]?.invoke("TTS error code $errorCode")
                    }
                    override fun onStop(uttId: String?, interrupted: Boolean) {
                        Log.d(TAG, "TTS stop: $uttId interrupted=$interrupted")
                    }
                })

                if (voiceName.isNotEmpty()) {
                    val voices: Set<Voice> = tts!!.voices
                    val targetVoice = voices.find { it.name == voiceName }
                    if (targetVoice != null) {
                        tts!!.voice = targetVoice
                        Log.d(TAG, "Set voice: $voiceName")
                    }
                }

                if (langTag.isNotEmpty()) {
                    val locale = Locale.forLanguageTag(langTag)
                    tts!!.setLanguage(locale)
                }

                tts!!.setSpeechRate(rate)
                val params = Bundle()
                tts!!.speak(text, TextToSpeech.QUEUE_FLUSH, params, utteranceId)
                Log.d(TAG, "Speaking: '$text' voice=$voiceName lang=$langTag rate=$rate")
            } catch (e: Exception) {
                Log.e(TAG, "speak error", e)
                resolveCallback(callbackId, """{"error":"${e.message}"}""")
            }
        }
    }

    @JavascriptInterface
    fun stop() {
        tts?.stop()
        pendingCallbacks.clear()
        Log.d(TAG, "TTS stopped")
    }

    @JavascriptInterface
    fun previewVoice(voiceName: String, langTag: String, callbackId: String) {
        ensureInitialized { ok ->
            if (!ok || tts == null) {
                resolveCallback(callbackId, """{"error":"TTS not ready"}""")
                return@ensureInitialized
            }
            try {
                val voices: Set<Voice> = tts!!.voices
                val voice = voices.find { it.name == voiceName }
                if (voice != null) {
                    tts!!.voice = voice
                }
                if (langTag.isNotEmpty()) {
                    tts!!.setLanguage(Locale.forLanguageTag(langTag))
                }
                tts!!.setSpeechRate(0.9f)

                val samples = mapOf(
                    "ja" to "こんにちは", "zh" to "你好", "ko" to "안녕하세요",
                    "en" to "Hello", "es" to "Hola", "fr" to "Bonjour",
                    "de" to "Hallo", "it" to "Ciao", "pt" to "Olá",
                    "ru" to "Здравствуйте"
                )
                val sampleText = samples[langTag.substringBefore("_").substringBefore("-")]
                    ?: samples[langTag] ?: "Hello"

                val uttId = "prev_${UUID.randomUUID()}"
                pendingCallbacks[uttId] = { error ->
                    resolveCallback(callbackId, if (error != null) """{"error":"$error"}""" else """{"done":true}""")
                    pendingCallbacks.remove(uttId)
                }
                tts!!.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
                    override fun onStart(uttId: String?) {}
                    override fun onDone(uttId: String?) { pendingCallbacks[uttId]?.invoke(null) }
                    @Deprecated("Deprecated in Java")
                    override fun onError(uttId: String?) { pendingCallbacks[uttId]?.invoke("Error") }
                    override fun onError(uttId: String?, errorCode: Int) { pendingCallbacks[uttId]?.invoke("Error $errorCode") }
                    override fun onStop(uttId: String?, interrupted: Boolean) {}
                })
                tts!!.speak(sampleText, TextToSpeech.QUEUE_FLUSH, Bundle(), uttId)
            } catch (e: Exception) {
                resolveCallback(callbackId, """{"error":"${e.message}"}""")
            }
        }
    }

    private fun resolveCallback(callbackId: String, json: String) {
        callbackHandler?.invoke(callbackId, json)
    }

    fun destroy() {
        scope.cancel()
        tts?.shutdown()
        tts = null
        isInitialized = false
        instance = null
    }
}
