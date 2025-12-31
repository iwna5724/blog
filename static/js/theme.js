/**
 * 다크모드 테마 전환 기능
 */

// ========================================
// 1. 테마 플래시 방지 (페이지 로드 전 즉시 실행)
// ========================================
(function() {
  const STORAGE_KEY = 'blog_theme';
  const DARK_CLASS = 'dark';
  
  // localStorage에서 테마 확인
  const savedTheme = localStorage.getItem(STORAGE_KEY);
  const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  const theme = savedTheme || (prefersDark ? 'dark' : 'light');
  
  // 즉시 html에 클래스 적용 (플래시 방지)
  if (theme === 'dark') {
    document.documentElement.classList.add(DARK_CLASS);
  }
})();

// ========================================
// 2. 테마 관리 (DOM 로드 후 실행)
// ========================================
(function() {
  const STORAGE_KEY = 'blog_theme';
  const DARK_CLASS = 'dark';
  
  // 테마 토글 버튼
  const themeToggle = document.getElementById('theme-toggle');
  
  /**
   * 현재 테마 가져오기
   */
  function getCurrentTheme() {
    // 1. localStorage 확인
    const savedTheme = localStorage.getItem(STORAGE_KEY);
    if (savedTheme) {
      return savedTheme;
    }
    
    // 2. 시스템 설정 확인
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      return 'dark';
    }
    
    // 3. 기본값: 다크모드
    return 'dark';
  }
  
  /**
   * 테마 적용
   */
  function applyTheme(theme) {
    if (theme === 'dark') {
      document.documentElement.classList.add(DARK_CLASS);
      if (themeToggle) {
        themeToggle.textContent = '🌙'; // 현재 다크모드
        themeToggle.setAttribute('aria-label', '라이트모드로 전환');
      }
    } else {
      document.documentElement.classList.remove(DARK_CLASS);
      if (themeToggle) {
        themeToggle.textContent = '☀️'; // 현재 라이트모드
        themeToggle.setAttribute('aria-label', '다크모드로 전환');
      }
    }
    
    // localStorage에 저장
    localStorage.setItem(STORAGE_KEY, theme);
  }
  
  /**
   * 테마 토글
   */
  function toggleTheme() {
    const currentTheme = getCurrentTheme();
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    applyTheme(newTheme);
  }
  
  // 페이지 로드 시 저장된 테마 적용
  applyTheme(getCurrentTheme());
  
  // 토글 버튼 이벤트
  if (themeToggle) {
    themeToggle.addEventListener('click', toggleTheme);
  }
  
  // 시스템 테마 변경 감지 (선택사항)
  if (window.matchMedia) {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
      // 사용자가 수동으로 설정하지 않은 경우에만 자동 변경
      if (!localStorage.getItem(STORAGE_KEY)) {
        applyTheme(e.matches ? 'dark' : 'light');
      }
    });
  }
  
  // 키보드 단축키 (Ctrl/Cmd + D)
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'd') {
      e.preventDefault();
      toggleTheme();
    }
  });
})();