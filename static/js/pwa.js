/**
 * PWA Service Worker 등록
 */

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('./service-worker.js')
      .then((registration) => {
        console.log('[PWA] Service Worker registered:', registration.scope);
        
        // 업데이트 확인
        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          console.log('[PWA] New Service Worker found');
          
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              // 새 버전 사용 가능
              console.log('[PWA] New version available! Please refresh.');
              
              // 자동으로 새 버전 활성화 (선택사항)
              if (confirm('새로운 버전이 있습니다. 업데이트하시겠습니까?')) {
                newWorker.postMessage({ type: 'SKIP_WAITING' });
                window.location.reload();
              }
            }
          });
        });
      })
      .catch((error) => {
        console.error('[PWA] Service Worker registration failed:', error);
      });
    
    // Service Worker 제어권 변경 시 페이지 새로고침
    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!refreshing) {
        refreshing = true;
        window.location.reload();
      }
    });
  });
}

// 앱 설치 프롬프트 (PWA 설치 유도)
let deferredPrompt;

window.addEventListener('beforeinstallprompt', (e) => {
  // 기본 브라우저 설치 프롬프트 방지
  e.preventDefault();
  deferredPrompt = e;
  
  console.log('[PWA] Install prompt ready');
  
  // 설치 버튼 표시 (선택사항)
  showInstallButton();
});

function showInstallButton() {
  // 설치 버튼이 있다면 표시
  const installButton = document.getElementById('install-button');
  if (installButton) {
    installButton.style.display = 'block';
    
    installButton.addEventListener('click', async () => {
      if (!deferredPrompt) return;
      
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      
      console.log('[PWA] Install outcome:', outcome);
      deferredPrompt = null;
      installButton.style.display = 'none';
    });
  }
}

// 설치 완료 감지
window.addEventListener('appinstalled', () => {
  console.log('[PWA] App installed successfully');
  deferredPrompt = null;
});

// 온라인/오프라인 상태 감지
window.addEventListener('online', () => {
  console.log('[PWA] Back online');
  document.body.classList.remove('offline');
  
  // 오프라인 배너가 있다면 숨김
  const offlineBanner = document.getElementById('offline-banner');
  if (offlineBanner) {
    offlineBanner.style.display = 'none';
  }
});

window.addEventListener('offline', () => {
  console.log('[PWA] Gone offline');
  document.body.classList.add('offline');
  
  // 오프라인 배너 표시 (선택사항)
  const offlineBanner = document.getElementById('offline-banner');
  if (offlineBanner) {
    offlineBanner.style.display = 'block';
  }
});