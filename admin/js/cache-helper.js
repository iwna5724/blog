/**
 * 블로그 포스트 캐싱 헬퍼
 * localStorage를 사용하여 GitHub API 호출 최소화
 */

class PostCacheHelper {
  constructor() {
    this.cacheKey = 'blog_posts_cache';
    this.maxAge = 30 * 24 * 60 * 60 * 1000; // 30일
  }

  /**
   * 캐시 로드
   * @returns {Object} 캐시 객체
   */
  loadCache() {
    try {
      const cached = localStorage.getItem(this.cacheKey);
      if (cached) {
        const cache = JSON.parse(cached);
        
        // 오래된 캐시 삭제
        const now = Date.now();
        Object.keys(cache).forEach(key => {
          if (cache[key].timestamp && now - cache[key].timestamp > this.maxAge) {
            delete cache[key];
          }
        });
        
        return cache;
      }
    } catch (error) {
      console.error('[CACHE] Load error:', error);
    }
    return {};
  }

  /**
   * 캐시 저장
   * @param {Object} cache - 캐시 객체
   */
  saveCache(cache) {
    try {
      localStorage.setItem(this.cacheKey, JSON.stringify(cache));
    } catch (error) {
      console.error('[CACHE] Save error:', error);
      
      // localStorage 용량 초과 시 초기화
      if (error.name === 'QuotaExceededError') {
        console.warn('[CACHE] Quota exceeded, clearing cache...');
        this.clearCache();
      }
    }
  }

  /**
   * 캐시 초기화
   */
  clearCache() {
    localStorage.removeItem(this.cacheKey);
    console.log('[CACHE] Cache cleared');
  }

  /**
   * 캐싱을 사용하여 포스트 로드
   * @param {Array} files - listFiles로 받은 파일 목록
   * @param {Function} getFileFunc - getFile 함수 (파일 이름을 받아 내용 반환)
   * @param {Function} parseFunc - 파싱 함수 (파일 이름, 내용을 받아 포스트 객체 반환)
   * @param {string} lang - 현재 언어 (선택사항, 기본값: 'ko')
   * @returns {Promise<Array>} 파싱된 포스트 배열
   */
  async loadPostsWithCache(files, getFileFunc, parseFunc, lang = 'ko') {
    const startTime = Date.now();
    console.log('[CACHE] Loading posts...');
    
    const cache = this.loadCache();
    const posts = [];
    let cacheHits = 0;
    let cacheMisses = 0;

    // 각 파일 처리
    for (const file of files) {
      try {
        // 언어별 캐시 키 생성
        const cacheKey = `post_${lang}_${file.name}`;
        const cached = cache[cacheKey];

        // 캐시가 있고 sha가 동일하면 캐시 사용
        if (cached && cached.sha === file.sha) {
          console.log(`[CACHE] Hit: ${file.name} (${lang})`);
          posts.push(cached.data);
          cacheHits++;
        } else {
          // 캐시 없거나 파일 변경됨 - API 호출
          console.log(`[CACHE] Miss: ${file.name} (${lang})`);
          const fileData = await getFileFunc(file.name);
          const postData = parseFunc(file.name, fileData.content);

          if (postData) {
            posts.push(postData);
            // 캐시에 저장
            cache[cacheKey] = {
              sha: file.sha,
              data: postData,
              timestamp: Date.now()
            };
            cacheMisses++;
          }
        }
      } catch (error) {
        console.error(`[CACHE] Error loading ${file.name}:`, error);
      }
    }

    // 캐시 저장
    this.saveCache(cache);

    const endTime = Date.now();
    const duration = endTime - startTime;
    console.log(`[CACHE] Load completed in ${duration}ms`);
    console.log(`[CACHE] Hits: ${cacheHits}, Misses: ${cacheMisses}`);
    console.log(`[CACHE] Cache efficiency: ${cacheHits > 0 ? Math.round(cacheHits / (cacheHits + cacheMisses) * 100) : 0}%`);

    return posts;
  }

  /**
   * 캐시 통계 조회
   * @returns {Object} 캐시 통계
   */
  getCacheStats() {
    const cache = this.loadCache();
    const keys = Object.keys(cache);
    const now = Date.now();
    
    let totalSize = 0;
    let oldestTimestamp = now;
    
    keys.forEach(key => {
      const item = cache[key];
      totalSize += JSON.stringify(item).length;
      if (item.timestamp && item.timestamp < oldestTimestamp) {
        oldestTimestamp = item.timestamp;
      }
    });
    
    return {
      itemCount: keys.length,
      totalSize: totalSize,
      totalSizeKB: Math.round(totalSize / 1024 * 100) / 100,
      oldestCacheAge: oldestTimestamp < now ? Math.round((now - oldestTimestamp) / 1000 / 60 / 60 / 24 * 100) / 100 : 0
    };
  }
}

// 전역으로 사용 가능하도록 export
if (typeof module !== 'undefined' && module.exports) {
  module.exports = PostCacheHelper;
}
