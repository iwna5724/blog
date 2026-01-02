/**
 * 클라이언트 사이드 검색 기능
 */

(function() {
  const searchInput = document.getElementById('search-input');
  const searchResults = document.getElementById('search-results');
  
  if (!searchInput) return;
  
  let searchIndex = [];
  let searchTimeout = null;
  
  /**
   * 검색 인덱스 로드
   */
  async function loadSearchIndex() {
    const baseUrl = getBaseUrl();
    
    // 시도할 경로들 (우선순위 순)
    const paths = [
      `${baseUrl}/search-index.json`,
      './search-index.json',
      '../search-index.json',
      '../../search-index.json'
    ];
    
    // 중복 제거
    const uniquePaths = [...new Set(paths)];
    
    for (const path of uniquePaths) {
      try {
        const response = await fetch(path);
        if (response.ok) {
          searchIndex = await response.json();
          console.log(`검색 인덱스 로드 성공: ${path}`);
          return;
        }
      } catch (error) {
        // 다음 경로 시도
        continue;
      }
    }
    
    console.warn('검색 인덱스를 찾을 수 없습니다. 검색 기능이 비활성화됩니다.');
  }
  
  /**
   * baseUrl 자동 감지
   */
  function getBaseUrl() {
    const path = window.location.pathname;
    
    // GitHub Pages 저장소 형태: /저장소명/public/...
    // 예: /blog/public/index.html, /blog/public/posts/first-post/index.html
    const publicMatch = path.match(/^\/([^\/]+)\/public\//);
    
    if (publicMatch) {
      // /blog/public/... 형태
      return `/${publicMatch[1]}/public`;
    }
    
    // GitHub Pages 저장소 형태 (public 없음): /저장소명/...
    const repoMatch = path.match(/^\/([^\/]+)\//);
    
    if (repoMatch && repoMatch[1] !== 'posts' && repoMatch[1] !== 'tags') {
      // /blog/... 형태
      return `/${repoMatch[1]}`;
    }
    
    // 루트에 배포된 경우 또는 로컬 테스트
    return '';
  }
  
  /**
   * 검색 실행
   */
  function search(query) {
    if (!query || query.length < 2) {
      hideResults();
      return;
    }
    
    const lowercaseQuery = query.toLowerCase();
    
    // 검색 수행
    const results = searchIndex.filter(post => {
      return (
        post.title.toLowerCase().includes(lowercaseQuery) ||
        post.excerpt.toLowerCase().includes(lowercaseQuery) ||
        (post.tags && post.tags.some(tag => tag.toLowerCase().includes(lowercaseQuery)))
      );
    });
    
    displayResults(results, query);
  }
  
  /**
   * 검색 결과 표시
   */
  function displayResults(results, query) {
    if (!searchResults) return;
    
    if (results.length === 0) {
      searchResults.innerHTML = `
        <div class="search-result-item">
          <div class="search-result-title">검색 결과가 없습니다</div>
          <div class="search-result-excerpt">"${escapeHtml(query)}"에 대한 결과를 찾을 수 없습니다.</div>
        </div>
      `;
      searchResults.classList.add('show');
      return;
    }
    
    const html = results.slice(0, 10).map(post => `
      <a href="./posts/${post.slug}/" class="search-result-item">
        <div class="search-result-title">${highlightText(escapeHtml(post.title), query)}</div>
        <div class="search-result-excerpt">${highlightText(escapeHtml(post.excerpt), query)}</div>
        ${post.tags && post.tags.length > 0 ? `
          <div class="post-tags" style="margin-top: 8px;">
            ${post.tags.map(tag => `<span class="tag" style="font-size: 12px;">${escapeHtml(tag)}</span>`).join(' ')}
          </div>
        ` : ''}
      </a>
    `).join('');
    
    searchResults.innerHTML = html;
    searchResults.classList.add('show');
  }
  
  /**
   * 검색 결과 숨기기
   */
  function hideResults() {
    if (searchResults) {
      searchResults.classList.remove('show');
    }
  }
  
  /**
   * 검색어 하이라이트
   */
  function highlightText(text, query) {
    if (!query) return text;
    
    const regex = new RegExp(`(${escapeRegex(query)})`, 'gi');
    return text.replace(regex, '<mark style="background: #ffd54f; padding: 2px 4px; border-radius: 2px;">$1</mark>');
  }
  
  /**
   * HTML 이스케이프
   */
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
  
  /**
   * 정규식 이스케이프
   */
  function escapeRegex(text) {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  
  /**
   * 이벤트 리스너
   */
  
  // 입력 이벤트 (디바운싱)
  searchInput.addEventListener('input', (e) => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      search(e.target.value);
    }, 300);
  });
  
  // 포커스 시 결과 다시 표시
  searchInput.addEventListener('focus', (e) => {
    if (e.target.value.length >= 2) {
      search(e.target.value);
    }
  });
  
  // ESC 키로 검색 결과 닫기
  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      hideResults();
      searchInput.blur();
    }
  });
  
  // 외부 클릭 시 검색 결과 숨기기
  document.addEventListener('click', (e) => {
    if (!searchInput.contains(e.target) && !searchResults?.contains(e.target)) {
      hideResults();
    }
  });
  
  // 검색 결과 링크 스타일 (CSS에서 정의하지 않은 경우)
  if (searchResults) {
    const style = document.createElement('style');
    style.textContent = `
      .search-result-item {
        display: block;
        text-decoration: none;
        color: inherit;
      }
    `;
    document.head.appendChild(style);
  }
  
  // 페이지 로드 시 검색 인덱스 로드
  loadSearchIndex();
  
  // 검색 단축키 (Ctrl/Cmd + K 또는 /)
  document.addEventListener('keydown', (e) => {
    // Ctrl/Cmd + K
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
      e.preventDefault();
      searchInput.focus();
    }
    
    // / 키 (입력 필드에 포커스가 없을 때만)
    if (e.key === '/' && document.activeElement !== searchInput && 
        document.activeElement.tagName !== 'INPUT' && 
        document.activeElement.tagName !== 'TEXTAREA') {
      e.preventDefault();
      searchInput.focus();
    }
  });
})();