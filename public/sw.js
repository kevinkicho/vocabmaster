/* sw.js */
const CACHE_NAME = 'vocab-master-v1132-offline'; // VERSION BUMP
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './tailwind.css',
  './favicon.svg',
  './master112625.csv',
  './js/config.js',
  './js/main.js',
  './js/store.js',
  './js/data.js',
  './js/ui.js',
  './js/services.js',
  './js/game_core.js',
  './js/presets.js',
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
      console.log('[SW] Caching assets');
      return Promise.all(
        ASSETS_TO_CACHE.map(url =>
          cache.add(url).catch(err => console.warn('[SW] Failed to cache:', url, err))
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
            console.log('[SW] Removing old cache', key);
            return caches.delete(key);
          }
        })
      );
    })
  );
});

self.addEventListener('fetch', (e) => {
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
