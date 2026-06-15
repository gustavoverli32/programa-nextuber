const CACHE_NAME = 'nextuber-v1';
const ASSETS = [
  './index.html',
  './manifest.json',
  './pwa-icons/icon-192x192.png',
  './pwa-icons/icon-512x512.png'
];

// Install — cachear arquivos essenciais
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

// Activate — limpar caches antigos
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch — network first, fallback to cache (garante dados atualizados do Supabase)
self.addEventListener('fetch', event => {
  // Requisições ao Supabase sempre vão pela rede
  if (event.request.url.includes('supabase.co')) {
    event.respondWith(fetch(event.request));
    return;
  }
  // CDNs sempre pela rede
  if (event.request.url.includes('cdn.jsdelivr.net')) {
    event.respondWith(fetch(event.request));
    return;
  }
  // App shell: tenta rede, senão usa cache
  event.respondWith(
    fetch(event.request)
      .then(response => {
        const clone = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
