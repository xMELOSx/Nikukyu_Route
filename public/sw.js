// にくきゅう大強盗 Service Worker — オフラインキャッシュ
const CACHE_NAME = 'heist-route-v1';

// インストール時にアプリシェルをキャッシュ
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll([
        './',
        './index.html',
        './manifest.json',
        './favicon.svg',
        './favicon.ico',
      ]).catch(() => {
        // 一部のリソースが取得できなくてもインストール自体は成功させる
        console.warn('[SW] Some resources failed to cache during install');
      });
    })
  );
  self.skipWaiting();
});

// 古いキャッシュをクリーンアップ
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

// ネットワークファースト: オンラインなら最新を取得、オフラインならキャッシュから
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // API リクエストやPOSTはキャッシュしない
  if (event.request.method !== 'GET') return;
  if (url.pathname.startsWith('/api/')) return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // 成功レスポンスをキャッシュに保存
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, clone);
          });
        }
        return response;
      })
      .catch(() => {
        // オフライン時はキャッシュから返す
        return caches.match(event.request).then((cached) => {
          if (cached) return cached;
          // HTMLリクエストはindex.htmlにフォールバック (SPA)
          if (event.request.headers.get('accept')?.includes('text/html')) {
            return caches.match('./index.html');
          }
          return new Response('Offline', { status: 503 });
        });
      })
  );
});
