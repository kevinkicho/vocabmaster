/* sw.js */
const CACHE_NAME = 'vocab-master-v1150';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './tailwind.css',
  './favicon.svg',
  './js/adaptive.js',
  './js/analytics.js',
  './js/auth.js',
  './js/capacitor_tts_bridge.js',
  './js/collection-bar.js',
  './js/config.js',
  './js/data.js',
  './js/escape.js',
  './js/firebase.js',
  './js/game_core.js',
  './js/game_flashcard.js',
  './js/game_grammar.js',
  './js/game_match.js',
  './js/game_quiz.js',
  './js/game_sentences.js',
  './js/game_story.js',
  './js/game_story_cache.js',
  './js/game_story_generator.js',
  './js/game_story_ui.js',
  './js/game_tf.js',
  './js/game_voice.js',
  './js/learning_loop.js',
  './js/llm.js',
  './js/main.js',
  './js/native_auth.js',
  './js/native_tts.js',
  './js/notes.js',
  './js/preferences_registry.js',
  './js/presets.js',
  './js/services.js',
  './js/settings_html.js',
  './js/store.js',
  './js/story_fallback.js',
  './js/ui.js',
  './js/ui_llm.js',
  './js/ui_modals.js',
  './js/ui_settings.js',
  './js/ui_stats.js',
  './js/vocabulary-collections.js',
  // External Libraries
  'https://unpkg.com/@phosphor-icons/web',
  'https://cdn.jsdelivr.net/npm/canvas-confetti@1.9.3/dist/confetti.browser.min.js',
  'https://cdn.jsdelivr.net/npm/chart.js',
  // Flag Icons
  'https://flagcdn.com/w40/jp.png',
  'https://flagcdn.com/w40/kr.png',
  'https://flagcdn.com/w40/us.png',
  'https://flagcdn.com/w40/cn.png',
  'https://flagcdn.com/w40/es.png',
  'https://flagcdn.com/w40/br.png',
  'https://flagcdn.com/w40/it.png',
  'https://flagcdn.com/w40/fr.png',
  'https://flagcdn.com/w40/de.png',
  'https://flagcdn.com/w40/ru.png',
  // Firebase SDKs
  'https://www.gstatic.com/firebasejs/11.0.2/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/11.0.2/firebase-auth-compat.js',
  'https://www.gstatic.com/firebasejs/11.0.2/firebase-database-compat.js'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return Promise.all(
        ASSETS_TO_CACHE.map(url =>
          cache.add(url).catch(err => { if (self.location.search.includes('debug=1')) console.warn('[SW] Failed to cache:', url, err); })
        )
      );
    })
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    })
  );
});

self.addEventListener('fetch', (e) => {
  // Skip non-GET requests (POST to Ollama/Firebase can't be cached)
  if (e.request.method !== 'GET') return;
  // Skip localhost (Ollama LLM API)
  const url = new URL(e.request.url);
  if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') return;

  e.respondWith(
    caches.match(e.request).then((cachedResponse) => {
      const fetchPromise = fetch(e.request).then((networkResponse) => {
        if (networkResponse && networkResponse.ok) {
          const clone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(e.request, clone));
        }
        return networkResponse;
      }).catch(() => cachedResponse);
      return cachedResponse || fetchPromise;
    })
  );
});
