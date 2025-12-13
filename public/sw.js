/* sw.js */
const CACHE_NAME = 'vocab-master-v1128-offline'; // VERSION BUMP
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './style.css',
  './master112625.csv',
  './js/config.js',
  './js/main.js',
  './js/store.js',
  './js/data.js',
  './js/ui.js',
  './js/services.js',
  './js/game_core.js',
  './js/games.js',
  './js/presets.js',
  // External Libraries
  'https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800;900&family=Noto+Sans+JP:wght@400;700;900&family=Noto+Sans+KR:wght@400;700;900&display=swap',
  'https://cdn.tailwindcss.com',
  'https://unpkg.com/@phosphor-icons/web',
  'https://cdn.jsdelivr.net/npm/canvas-confetti@1.9.3/dist/confetti.browser.min.js',
  'https://cdn.jsdelivr.net/npm/chart.js',
  // Firebase SDKs (Ensure these are cached so UI loads even if offline)
  'https://www.gstatic.com/firebasejs/11.0.2/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/11.0.2/firebase-auth-compat.js',
  'https://www.gstatic.com/firebasejs/11.0.2/firebase-database-compat.js'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] Caching assets');
      return cache.addAll(ASSETS_TO_CACHE);
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
      return cachedResponse || fetch(e.request);
    })
  );
});
