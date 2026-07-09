const CACHE_NAME = 'heist-route-v3';

const PRECACHE_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './favicon.svg',
  './favicon.ico',
  './icons.svg',
  './nikukyu_map.webp',
  './user-dict.json',
  './maps/lg1_1.png',
  './maps/lg1_2.png',
  './maps/lg1_3_left.png',
  './maps/lg1_3_right.png',
  './maps/lg1_4.png',
  './maps/lg2_1.png',
  './maps/lg2_2.png',
  './maps/lg3_boss.png',
  './maps/lg3_main.png',
  './global_markers.json',
  './global_walls.json',
  './global_spawns.json',
  './global_help.json',
  './global_defaults.json',
  './global_sim_defaults.json',
  './global_sim_pools.json',
  './default_preset.json',
  './presets.json',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      cache.addAll(PRECACHE_ASSETS).catch((err) =>
        console.warn('[SW] Precache failed:', err)
      )
    )
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    ).then(() => {
      self.clients.matchAll().then((clients) => {
        clients.forEach((client) =>
          client.postMessage({ type: 'CACHE_UPDATED' })
        );
      });
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.pathname.startsWith('/api/')) return;

  // texture/ と uploads/ はネットワーク優先（新規追加を反映させるため）
  if (url.pathname.includes('/texture/') || url.pathname.includes('/uploads/')) {
    event.respondWith(
      fetch(event.request).then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => caches.match(event.request))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      });
    }).catch(() => {
      return caches.match('./index.html');
    })
  );
});
