/**
 * 언어 관리 시스템
 * 한국어/일본어 전환 및 저장
 */

class LanguageManager {
  constructor() {
    this.currentLang = this.getLanguage();
    this.init();
  }

  /**
   * 현재 언어 가져오기 (localStorage 또는 기본값)
   */
  getLanguage() {
    const savedLang = localStorage.getItem('blog_language');
    return savedLang || 'ko'; // 기본값: 한국어
  }

  /**
   * 언어 설정
   */
  setLanguage(lang) {
    if (lang !== 'ko' && lang !== 'ja') {
      console.error('지원하지 않는 언어:', lang);
      return;
    }
    
    this.currentLang = lang;
    localStorage.setItem('blog_language', lang);
    
    // 언어 변경 이벤트 발생
    window.dispatchEvent(new CustomEvent('languagechange', { 
      detail: { language: lang } 
    }));
  }

  /**
   * 언어 토글
   */
  toggleLanguage() {
    const newLang = this.currentLang === 'ko' ? 'ja' : 'ko';
    this.setLanguage(newLang);
    location.reload(); // 페이지 새로고침으로 적용
  }

  /**
   * 초기화
   */
  init() {
    // 언어 토글 버튼 찾기
    const toggleBtn = document.getElementById('lang-toggle');
    if (toggleBtn) {
      toggleBtn.addEventListener('click', () => this.toggleLanguage());
      this.updateToggleButton(toggleBtn);
    }

    // 현재 언어 표시 업데이트
    this.updateLanguageDisplay();
    
    // 페이지의 모든 다국어 텍스트 업데이트
    this.updatePageTexts();
  }
  
  /**
   * 페이지의 모든 data-i18n 요소 업데이트
   */
  updatePageTexts() {
    // UI 텍스트 업데이트
    const elements = document.querySelectorAll('[data-i18n]');
    elements.forEach(element => {
      const key = element.getAttribute('data-i18n');
      const text = this.getUIText(key);
      if (text) {
        element.textContent = text;
      }
    });
    
    // 다국어 제목 업데이트 (data-lang-ko, data-lang-ja 속성 사용)
    const langElements = document.querySelectorAll('[data-lang-ko][data-lang-ja]');
    langElements.forEach(element => {
      const koText = element.getAttribute('data-lang-ko');
      const jaText = element.getAttribute('data-lang-ja');
      
      if (this.currentLang === 'ja' && jaText) {
        element.textContent = jaText;
      } else if (koText) {
        element.textContent = koText;
      }
    });
  }

  /**
   * 토글 버튼 상태 업데이트 (현재 언어 국기 표시)
   */
  updateToggleButton(btn) {
    // 기존 img 태그에서 경로 가져오기
    const img = btn.querySelector('img');
    if (!img) return;
    
    const currentSrc = img.getAttribute('src');
    const basePath = currentSrc.replace(/\/[^\/]+\.svg$/, ''); // 파일명 제거
    
    if (this.currentLang === 'ko') {
      // 한국어 모드 → 한국 국기 표시
      img.setAttribute('src', basePath + '/KOREA.svg');
      img.setAttribute('alt', '한국어');
      btn.setAttribute('title', '日本語に切り替え');
      btn.setAttribute('aria-label', '日本語に切り替え');
    } else {
      // 일본어 모드 → 일본 국기 표시
      img.setAttribute('src', basePath + '/JAPAN.svg');
      img.setAttribute('alt', '日本語');
      btn.setAttribute('title', '한국어로 전환');
      btn.setAttribute('aria-label', '한국어로 전환');
    }
  }

  /**
   * 현재 언어 표시 업데이트
   */
  updateLanguageDisplay() {
    document.documentElement.setAttribute('lang', this.currentLang);
    document.body.setAttribute('data-lang', this.currentLang);
  }

  /**
   * 다국어 객체에서 현재 언어 텍스트 추출
   */
  getText(textObj) {
    if (!textObj) return '';
    
    // 문자열이면 그대로 반환
    if (typeof textObj === 'string') return textObj;
    
    // 객체면 현재 언어 반환
    if (typeof textObj === 'object') {
      return textObj[this.currentLang] || textObj['ko'] || '';
    }
    
    return '';
  }

  /**
   * 다국어 태그 배열 추출
   */
  getTags(tagsObj) {
    if (!tagsObj) return [];
    
    // 배열이면 그대로 반환
    if (Array.isArray(tagsObj)) return tagsObj;
    
    // 객체면 현재 언어 배열 반환
    if (typeof tagsObj === 'object') {
      return tagsObj[this.currentLang] || tagsObj['ko'] || [];
    }
    
    return [];
  }

  /**
   * 마크다운 본문에서 현재 언어 추출
   * <!-- ko -->...<!-- /ko --> 형식
   */
  extractLanguageContent(markdown) {
    if (!markdown) return '';
    
    const lang = this.currentLang;
    
    // 언어 태그로 감싸진 부분 찾기
    const regex = new RegExp(`<!--\\s*${lang}\\s*-->([\\s\\S]*?)<!--\\s*/${lang}\\s*-->`, 'g');
    const matches = markdown.match(regex);
    
    if (matches && matches.length > 0) {
      // 모든 매칭된 부분 합치기
      return matches
        .map(match => {
          return match
            .replace(new RegExp(`<!--\\s*${lang}\\s*-->`, 'g'), '')
            .replace(new RegExp(`<!--\\s*/${lang}\\s*-->`, 'g'), '')
            .trim();
        })
        .join('\n\n');
    }
    
    // 언어 태그가 없으면 전체 반환 (하위 호환성)
    return markdown;
  }

  /**
   * 다국어 마크다운 생성 (에디터용)
   */
  createMultiLangMarkdown(koContent, jaContent) {
    return `<!-- ko -->
${koContent.trim()}
<!-- /ko -->

<!-- ja -->
${jaContent.trim()}
<!-- /ja -->`;
  }

  /**
   * UI 텍스트 번역
   */
  getUIText(key) {
    const translations = {
      // 네비게이션
      'nav.home': {
        ko: '홈',
        ja: 'ホーム'
      },
      'nav.tags': {
        ko: '태그',
        ja: 'タグ'
      },
      'nav.recentPosts': {
        ko: '최근 글',
        ja: '最近の記事'
      },
      // 메인 페이지
      'readMore': {
        ko: '더 읽기 →',
        ja: '続きを読む →'
      },
      'loading': {
        ko: '글 목록을 불러오는 중...',
        ja: '記事リストを読み込んでいます...'
      },
      'noPosts': {
        ko: '아직 작성된 글이 없습니다',
        ja: 'まだ記事がありません'
      },
      'writeFirst': {
        ko: '첫 번째 글을 작성해보세요!',
        ja: '最初の記事を書いてみましょう！'
      },
      'goToWrite': {
        ko: '✍️ 글 쓰러 가기',
        ja: '✍️ 記事を書く'
      },
      'errorOccurred': {
        ko: '⚠️ 오류 발생',
        ja: '⚠️ エラーが発生しました'
      },
      'loadError': {
        ko: '글 목록을 불러오는데 실패했습니다',
        ja: '記事リストの読み込みに失敗しました'
      },
      'postCount': {
        ko: '개의 글',
        ja: '件の記事'
      },
      // 태그 페이지
      'allTags': {
        ko: '모든 태그',
        ja: 'すべてのタグ'
      },
      'backToAllTags': {
        ko: '← 전체 태그',
        ja: '← すべてのタグ'
      },
      'backToHome': {
        ko: '← 홈으로 돌아가기',
        ja: '← ホームに戻る'
      },
      'totalPrefix': {
        ko: '총',
        ja: '全'
      },
      'tagsCount': {
        ko: '개의 태그',
        ja: '個のタグ'
      },
      'postsWithTag': {
        ko: '태그가 있는 글',
        ja: 'タグ付きの記事'
      },
      // 검색
      'searchPlaceholder': {
        ko: '검색어를 입력하세요...',
        ja: '検索ワードを入力...'
      },
      // 날짜
      'year': {
        ko: '년',
        ja: '年'
      },
      'month': {
        ko: '월',
        ja: '月'
      },
      'day': {
        ko: '일',
        ja: '日'
      }
    };
    
    if (!translations[key]) {
      console.warn('Translation not found:', key);
      return key;
    }
    
    return translations[key][this.currentLang] || translations[key]['ko'] || key;
  }

  /**
   * 날짜 포맷 (언어별)
   */
  formatDate(dateString) {
    if (!dateString) return '';
    const date = new Date(dateString);
    const locale = this.currentLang === 'ja' ? 'ja-JP' : 'ko-KR';
    
    return date.toLocaleDateString(locale, {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  }

  /**
   * Front Matter 생성 (다국어)
   */
  createFrontMatter(data) {
    const lines = ['---'];
    
    // 제목
    if (data.title) {
      if (typeof data.title === 'object') {
        lines.push('title:');
        lines.push(`  ko: "${data.title.ko || ''}"`);
        lines.push(`  ja: "${data.title.ja || ''}"`);
      } else {
        lines.push(`title: "${data.title}"`);
      }
    }
    
    // 날짜
    if (data.date) {
      lines.push(`date: ${data.date}`);
    }
    
    // 태그
    if (data.tags) {
      if (typeof data.tags === 'object' && !Array.isArray(data.tags)) {
        lines.push('tags:');
        if (data.tags.ko) {
          lines.push(`  ko: [${data.tags.ko.join(', ')}]`);
        }
        if (data.tags.ja) {
          lines.push(`  ja: [${data.tags.ja.join(', ')}]`);
        }
      } else if (Array.isArray(data.tags)) {
        lines.push(`tags: [${data.tags.join(', ')}]`);
      }
    }
    
    lines.push('---');
    return lines.join('\n');
  }
}

// 전역 인스턴스 생성 (DOM 로드 후)
let langManager;

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    langManager = new LanguageManager();
  });
} else {
  // 이미 로드된 경우 즉시 실행
  langManager = new LanguageManager();
}