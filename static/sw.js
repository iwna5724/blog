// Service Worker for iwna5724 Blog PWA
const CACHE_NAME = 'blog-cache-v1';

// 오프라인에서 캐시할 핵심 파일
const PRECACHE_URLS = [
  './',
  './index.html',
  './lists.html',
  './music.html',
  './static/css/style.css',
  './static/css/music.css',
  './static/js/theme.js',
  './static/js/language.js',
  './static/js/search.js',
  './static/images/favicon.ico',
  './static/images/spotify.png',
  './static/images/flags/KOREA.svg',
  './static/images/flags/JAPAN.svg'
];

// 설치: 핵심 파일 프리캐시
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

// 활성화: 이전 캐시 정리
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

// 요청 가로채기: Network First (온라인이면 네트워크, 실패 시 캐시)
self.addEventListener('fetch', event => {
  // POST 등 non-GET 요청은 무시
  if (event.request.method !== 'GET') return;

  // admin 페이지는 캐시하지 않음
  if (event.request.url.includes('/admin/')) return;

  event.respondWith(
    fetch(event.request)
      .then(response => {
        // 정상 응답이면 캐시에 복사 후 반환
        if (response.ok) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, responseClone);
          });
        }
        return response;
      })
      .catch(() => {
        // 네트워크 실패 시 캐시에서 반환
        return caches.match(event.request);
      })
  );
});
