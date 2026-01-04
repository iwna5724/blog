/**
 * Service Worker - 오프라인 지원 및 캐싱
 * 버전 관리: 업데이트 시 버전을 올려주세요
 */

const CACHE_VERSION = 'blog-v1.0.0';
const CACHE_NAME = `${CACHE_VERSION}`;

// 즉시 캐싱할 핵심 파일들
const CORE_ASSETS = [
  '/',
  '/index.html',
  '/lists.html',
  '/static/css/style.css',
  '/static/js/theme.js',
  '/static/js/language.js',
  '/static/js/search.js',
  '/static/images/favicon.ico',
  '/static/images/flags/KOREA.svg',
  '/static/images/flags/JAPAN.svg'
];

// 관리자 페이지 (오프라인에서도 글 작성 가능)
const ADMIN_ASSETS = [
  '/admin/login.html',
  '/admin/index.html',
  '/admin/editor.html',
  '/admin/js/github-api.js'
];

// 설치 이벤트: 핵심 자산 캐싱
self.addEventListener('install', (event) => {
  console.log('[Service Worker] Installing...');
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[Service Worker] Caching core assets');
        return cache.addAll(CORE_ASSETS.concat(ADMIN_ASSETS));
      })
      .then(() => {
        console.log('[Service Worker] Installation complete');
        // 새 Service Worker 즉시 활성화
        return self.skipWaiting();
      })
      .catch((error) => {
        console.error('[Service Worker] Installation failed:', error);
      })
  );
});

// 활성화 이벤트: 오래된 캐시 삭제
self.addEventListener('activate', (event) => {
  console.log('[Service Worker] Activating...');
  
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            if (cacheName !== CACHE_NAME) {
              console.log('[Service Worker] Deleting old cache:', cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      })
      .then(() => {
        console.log('[Service Worker] Activation complete');
        // 모든 클라이언트에서 즉시 제어 시작
        return self.clients.claim();
      })
  );
});

// Fetch 이벤트: 네트워크 요청 가로채기
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // GitHub API 요청은 캐싱하지 않음 (항상 최신 데이터)
  if (url.hostname === 'api.github.com') {
    event.respondWith(fetch(request));
    return;
  }

  // 외부 리소스 (CDN 등)는 Network First
  if (url.origin !== location.origin) {
    event.respondWith(
      fetch(request)
        .catch(() => caches.match(request))
    );
    return;
  }

  // HTML 파일: Network First, Cache Fallback
  if (request.destination === 'document') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // 응답을 캐시에 저장
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, responseClone);
          });
          return response;
        })
        .catch(() => {
          // 네트워크 실패 시 캐시에서 반환
          return caches.match(request)
            .then((cached) => {
              if (cached) {
                return cached;
              }
              // 캐시도 없으면 오프라인 페이지 (선택사항)
              return caches.match('/index.html');
            });
        })
    );
    return;
  }

  // 정적 자산 (CSS, JS, 이미지): Cache First
  event.respondWith(
    caches.match(request)
      .then((cached) => {
        if (cached) {
          // 캐시가 있으면 즉시 반환
          return cached;
        }
        
        // 캐시 없으면 네트워크에서 가져오고 캐싱
        return fetch(request)
          .then((response) => {
            // 유효한 응답만 캐싱
            if (!response || response.status !== 200 || response.type === 'error') {
              return response;
            }
            
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, responseClone);
            });
            
            return response;
          })
          .catch((error) => {
            console.error('[Service Worker] Fetch failed:', error);
            throw error;
          });
      })
  );
});

// 메시지 이벤트: 캐시 강제 업데이트
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  
  if (event.data && event.data.type === 'CLEAR_CACHE') {
    event.waitUntil(
      caches.keys().then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => caches.delete(cacheName))
        );
      })
    );
  }
});