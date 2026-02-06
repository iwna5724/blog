/**
 * 언어 관리 시스템
 * 한국어/일본어 전환 및 저장
 */

class LanguageManager {
  constructor() {
    this.currentLang = this.getLanguage();
    // init()은 DOM 준비 후 호출
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
    sessionStorage.setItem('lang_switch', '1');
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
    // HTML을 포함할 수 있는 키 목록
    const htmlKeys = ['hero.description'];
    
    // UI 텍스트 업데이트
    const elements = document.querySelectorAll('[data-i18n]');
    elements.forEach(element => {
      const key = element.getAttribute('data-i18n');
      const text = this.getUIText(key);
      element.innerHTML = text;
    });
    
    // placeholder 업데이트
    const placeholderElements = document.querySelectorAll('[data-i18n-placeholder]');
    placeholderElements.forEach(element => {
      const key = element.getAttribute('data-i18n-placeholder');
      const text = this.getUIText(key);
      if (text) {
        element.setAttribute('placeholder', text);
      }
    });
    
    // 다국어 제목 업데이트 (data-lang-ko, data-lang-ja 속성 사용)
    const langElements = document.querySelectorAll('[data-lang-ko][data-lang-ja]');
    langElements.forEach(element => {
      const koText = element.getAttribute('data-lang-ko');
      const jaText = element.getAttribute('data-lang-ja');
      
      if (this.currentLang === 'ja' && jaText) {
        element.innerHTML = jaText;
      } else if (koText) {
        element.innerHTML = koText;
      }
    });

    // 날짜 업데이트 (data-date 속성 사용)
    const dateElements = document.querySelectorAll('[data-date]');
    dateElements.forEach(element => {
      const dateString = element.getAttribute('data-date');
      if (dateString) {
        const formattedDate = this.formatDate(dateString);
        element.textContent = formattedDate;
      }
    });
  }

  /**
   * 토글 버튼 상태 업데이트
   */
  updateToggleButton(btn) {
    // 기존 img 태그에서 경로 가져오기
    const img = btn.querySelector('img');
    if (!img) return;
    
    const currentSrc = img.getAttribute('src');
    const basePath = currentSrc.replace(/\/[^\/]+\.svg$/, ''); // 파일명 제거
    
    if (this.currentLang === 'ko') {
      img.setAttribute('src', basePath + '/KOREA.svg'); // 현재 한국어
      img.setAttribute('alt', '한국어');
      btn.setAttribute('title', '日本語に切り替え');
      btn.setAttribute('aria-label', '日本語に切り替え');
    } else {
      img.setAttribute('src', basePath + '/JAPAN.svg'); // 현재 일본어
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
      'nav.recentPosts': {
        ko: '최근 글',
        ja: '最近の投稿'
      },
      'nav.lists': {
        ko: '글 목록',
        ja: '投稿一覧'
      },
      // 글 목록 페이지
      'lists.title': {
        ko: '글 목록',
        ja: '投稿一覧'
      },
      'lists.subtitle': {
        ko: '각종 기준으로 정리한 글 목록',
        ja: '各種基準で整理した投稿一覧'
      },
      'lists.calendar': {
        ko: '<span style="font-weight: 780;">작성일</span>로부터 찾기',
        ja: '<span style="font-weight: 780;">作成日</span>から探す'
      },
      'lists.type': {
        ko: '글의 <span style="font-weight: 780;">종류</span>로부터 찾기',
        ja: '文の<span style="font-weight: 780;">種類</span>から探す'
      },
      'lists.satisfaction': {
        ko: '작성일 당시의 <span style="font-weight: 780;">만족도</span>로부터 찾기',
        ja: '作成日当時の<span style="font-weight: 780;">満足度</span>から探す'
      },
      // 카운트
      'totalPrefix': {
        ko: '총',
        ja: '計'
      },
      'totalSuffix': {
        ko: '개',
        ja: '件'
      },
      // 메인 페이지
      'hero.description': {
        ko: '<a href="https://bit.ly/iwna5724" target="_blank" class="read-more" rel="noopener noreferrer">클라우드</a>의 내용물을 구현하는 작업 중입니다.<br>새로운 글은 이 사이트에서만 갱신됩니다.',
        ja: '<a href="https://bit.ly/iwna5724" target="_blank" class="read-more" rel="noopener noreferrer">クラウド</a> の中身を具現する作業中です。<br>新しい投稿はこのサイトでのみ更新されます。'
      },
      'search.placeholder': {
        ko: '검색 - 타이틀 / 날짜(YY/MM/DD 혹은 YY-MM-DD)',
        ja: '検索 - タイトル / 日付(YY/MM/DD または YY-MM-DD)'
      },
      'search.noResults': {
        ko: '검색 결과가 없습니다',
        ja: '検索結果がありません'
      },
      'search.noResultsDesc': {
        ko: '에 대한 결과를 찾을 수 없습니다.',
        ja: 'に一致する結果が見つかりませんでした。'
      },
      'readMore': {
        ko: '더 읽기 →',
        ja: '続きを読む →'
      },
      'loading': {
        ko: '목록을 불러오는 중...',
        ja: 'リスト読み込み中...'
      },
      'noPosts': {
        ko: '아직 작성된 글이 없습니다',
        ja: 'まだ投稿がありません'
      },
      'writeFirst': {
        ko: '첫 번째 글을 작성해보세요!',
        ja: '最初の文を書いてみましょう！'
      },
      'goToWrite': {
        ko: '✍️ 글 쓰러 가기',
        ja: '✍️ 文を書く'
      },
      'errorOccurred': {
        ko: '⚠️ 오류 발생',
        ja: '⚠️ エラー発生'
      },
      'loadError': {
        ko: '목록을 불러오는데 실패했습니다',
        ja: 'リストの読み込みに失敗しました'
      },
      'postCount': {
        ko: '개의 글',
        ja: '件の投稿'
      },
      // 태그 페이지
      'allTags': {
        ko: '모든 태그',
        ja: 'すべてのタグ'
      },
      'postsWithTag': {
        ko: '태그가 있는 글',
        ja: 'タグ付きの文'
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
      },
      // 네비게이션 링크
      'backToHome': {
        ko: '← 홈으로 돌아가기',
        ja: '← ホームに戻る'
      },
      'backToAllTags': {
        ko: '← 모든 태그로 돌아가기',
        ja: '← すべてのタグに戻る'
      },
      // 달력
      'calendar.prev': {
        ko: '◀ 이전',
        ja: '◀ 前'
      },
      'calendar.next': {
        ko: '다음 ▶',
        ja: '次 ▶'
      },
      // 음악 페이지
      'nav.music': {
        ko: '음악',
        ja: '音楽'
      },
      'music.title': {
        ko: '음악 - ',
        ja: '音楽 - '
      },
      'music.pageTitle': {
        ko: '음악 컬렉션',
        ja: '音楽コレクション'
      },
      'music.pageSubtitle': {
        ko: '<span class="subtitle-line">로딩에 다소 시간이 소요될 수 있습니다.</span>',
        ja: '<span class="subtitle-line">読込に多少時間がかかる場合があります。</span>'
      },
      'music.infoLink': {
        ko: 'ⓘ음악 페이지에 대해',
        ja: 'ⓘ音楽ページについて'
      },
      'music.infoTooltip': {
        ko: '・이 페이지에서는 제가 좋아하는 앨범들을 정리하고 있습니다.<br>・앨범 커버를 클릭하면해당 앨범에 대한 정보를 확인할 수 있습니다.<br>・스포티파이와 동일한 버전의 음악/영상이 있을 경우 유튜브 뮤직의 링크도 표시합니다.<br>・"CD"란, 실제 피지컬 CD를 구매한 앨범/EP를 의미합니다.<br><br>・선호도(별점)은 어디까지나 저의 주관적인 감상이며, 작품성에 대한 평가가 아닙니다.<br>・선호도는 특정한 기준 없이 매우 직감적인 판단에 따르기 때문에, 실제 선호도와 약간의 차이가 있을 수 있습니다.<br>・선호도가 1점이라고 해서 해당 앨범을 좋아하지 않는다는 것을 의미하지는 않습니다. 우선 순위가 낮을 뿐입니다.',
        ja: '・このページでは、自分が好きなアルバムをまとめています。<br>・アルバムカバーをクリックすると、そのアルバムに関する情報を確認することができます。<br>・Spotifyと同じバージョンの音楽/動画がある場合、YouTube Musicのリンクも表示されます。<br>・「CD」とは、実際にフィジカルCDを購入したアルバム/EPを意味します。<br><br>・選好度(星評価)はあくまでも自分の主観的な感想であり、作品性に対する評価ではありません。<br>・選好度は特定の基準がなく非常に直感的な判断によるため、実際の選好度と若干の違いがある場合があります。<br>・選好度が1点だからといって、当該アルバムが好きでないという意味ではありません。優先順位が低いだけです。'
      },
      'music.artistAlbum': {
        ko: '아티스트・앨범명',
        ja: 'アーティスト・アルバム名'
      },
      'music.releaseDate': {
        ko: '발매일',
        ja: 'リリース日'
      },
      'music.duration': {
        ko: '재생 시간',
        ja: '再生時間'
      },
      'music.rating': {
        ko: '개인적 선호도',
        ja: '個人的選好度'
      },
      'music.favTrack': {
        ko: '최애 트랙',
        ja: '一番好きなトラック'
      },
      'music.defaultCategory': {
        ko: '앨범',
        ja: 'アルバム'
      },
      'music.noInfo': {
        ko: '정보 없음',
        ja: '情報なし'
      },
      'music.trackExcludeSuffix': {
        ko: '번 트랙 제외',
        ja: '番トラック除外'
      },
      // 카테고리 번역
      'music.category.album': {
        ko: '앨범',
        ja: 'アルバム'
      },
      'music.category.single': {
        ko: '싱글',
        ja: 'シングル'
      },
      'music.category.ep': {
        ko: 'EP',
        ja: 'EP'
      },
      // 뷰 토글
      'music.viewGrid': {
        ko: '그리드로 보기',
        ja: 'グリッドで見る'
      },
      'music.viewList': {
        ko: '리스트로 보기',
        ja: 'リストで見る'
      },
      'music.viewData': {
        ko: '데이터로 보기',
        ja: 'データで見る'
      },
      'music.dataIntro': {
        ko: '<span style="font-size : 16px;">Spotify의 재생 기록을 바탕으로,<br class="break-m">가장 많이 들은 아티스트와 앨범 등의<br class="break-m">각종 통계를 확인할 수 있는 외부 서비스</span><br><br>공통: 실제와 다른 앨범이 표시되는 경우가 꽤 많음<br>(스탠다드가 아닌 디럭스 에디션이나 컴필레이션 앨범을 들은 것으로 표시되는 등)',
        ja: '<span style="font-size : 16px;">Spotifyのリスニング履歴をもとに、<br class="break-m">最も再生したアーティストやアルバムなどの<br class="break-m">各種統計を確認できる外部サービス</span><br><br>共通: 実際と異なるアルバムが表示される場合が結構多い<br>(スタンダードではない、デラックスディションやコンピレーションアルバムを聴いたと表示されるなど)'
      },
      'music.dataStatsDesc': {
        ko: '특징:<br>・각종 통계는 오직 "재생 시간"을 기준으로 정렬됨<br>・현재 듣고 있는 곡은 표시되지 않지만, 최근에 들은 곡은 표시됨<br>・리스트의 길이가 김(top 250까지)<br>・기준 기간이 다양함(오늘, 이번주, 최근 4주 등)',
        ja: '特徴:<br>・各種統計は「再生時間」のみを基準に整列される<br>・現在聴いている曲は表示されないが、最近聴いた曲は表示される<br>・リストの長さが長い(top 250まで)<br>・基準期間が様々(今日、今週、直近4週間など)'
      },
      'music.dataVoltDesc': {
        ko: '특징:<br>・재생 시간과 재생 횟수를 종합적으로 평가하여 정렬됨<br>・최근에 들은 곡은 표시되지 않지만, 현재 듣고 있는 곡은 표시됨<br>・자주 듣는 음악의 특징이 표시됨(유명도, 발매년도, 길이)<br>・사이트의 UI가 깔끔함',
        ja: '特徴:<br>・再生時間と再生回数を総合的に評価して整列される<br>・最近聴い曲は表示されないが、現在聴いている曲は表示される<br>・よく聴く音楽の特徴が表示される(有名度、発売年、長さ)<br>・サイトのUIがすっきりしている'
      },
      // 리스트 헤더
      'music.list.id': {
        ko: 'ID',
        ja: 'ID'
      },
      'music.list.cover': {
        ko: '앨범 커버',
        ja: 'ジャケット'
      },
      'music.list.artist': {
        ko: '아티스트',
        ja: 'アーティスト'
      },
      'music.list.albumName': {
        ko: '앨범명',
        ja: 'アルバム名'
      },
      'music.list.release': {
        ko: '발매일',
        ja: 'リリース日'
      },
      'music.list.duration': {
        ko: '재생 시간',
        ja: '再生時間'
      },
      'music.list.rating': {
        ko: '선호도',
        ja: '選好度'
      },
      'music.list.category': {
        ko: '구분',
        ja: '区分'
      },
      'music.sortCriteria': {
        ko: '정렬 기준',
        ja: '整列基準'
      },
      // 리스트 그룹 헤더
      'music.group.appearances': {
        ko: '번 등장',
        ja: '回登場'
      },
      'music.group.decade': {
        ko: '년대',
        ja: '年代'
      },
      'music.group.dur.under9': {
        ko: '~9분',
        ja: '~9分'
      },
      'music.group.dur.10to29': {
        ko: '10~29분',
        ja: '10~29分'
      },
      'music.group.dur.30to59': {
        ko: '30~59분',
        ja: '30~59分'
      },
      'music.group.dur.over60': {
        ko: '1시간~',
        ja: '1時間~'
      },
      'music.group.noRating': {
        ko: '미설정',
        ja: '未設定'
      },
      // 필터
      'music.filter': {
        ko: '필터',
        ja: 'フィルター'
      },
      // AES 모달
      'aes.title': {
        ko: '🔐 AES 암호화 도구',
        ja: '🔐 AES暗号化ツール'
      },
      'aes.key1.label': {
        ko: '1차 암호키',
        ja: '1次秘密鍵'
      },
      'aes.key1.placeholder': {
        ko: '게시글 암호문용',
        ja: '投稿暗号文用'
      },
      'aes.key2.label': {
        ko: '2차 암호키',
        ja: '2次秘密鍵'
      },
      'aes.key2.placeholder': {
        ko: '내부 암호문용',
        ja: '内部暗号文用'
      },
      'aes.decrypt': {
        ko: '🔓 복호화',
        ja: '🔓 復号化'
      },
      'aes.decryptedText': {
        ko: '복호화된 텍스트',
        ja: '復号化されたテキスト'
      },
      'aes.error.noKey': {
        ko: '1차 암호키와 2차 암호키를 모두 입력해주세요.',
        ja: '1次秘密鍵と2次秘密鍵を両方入力してください。'
      },
      'aes.error.noCiphertext': {
        ko: '암호문이 없습니다.',
        ja: '暗号文がありません。'
      },
      'aes.error.key1Failed': {
        ko: '1차 복호화에 실패했습니다. 1차 암호키를 확인해주세요.',
        ja: '1次復号化に失敗しました。1次秘密鍵を確認してください。'
      },
      'aes.error.key2Failed': {
        ko: '2차 복호화에 실패했습니다. 2차 암호키를 확인해주세요.',
        ja: '2次復号化に失敗しました。2次秘密鍵を確認してください。'
      },
      'aes.error.general': {
        ko: '복호화 중 오류가 발생했습니다. 암호키를 확인해주세요.',
        ja: '復号化中にエラーが発生しました。秘密鍵を確認してください。'
      },
      'aes.openButton': {
        ko: '🔓 암호문 복호화',
        ja: '🔓 暗号文復号化'
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
   * 월 이름 배열 반환 (언어별)
   */
  getMonthNames() {
    const months = {
      ko: ['1월', '2월', '3월', '4월', '5월', '6월', '7월', '8월', '9월', '10월', '11월', '12월'],
      ja: ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月']
    };
    return months[this.currentLang] || months['ko'];
  }

  /**
   * 요일 이름 배열 반환 (언어별)
   */
  getDayNames() {
    const days = {
      ko: ['일', '월', '화', '수', '목', '금', '토'],
      ja: ['日', '月', '火', '水', '木', '金', '土']
    };
    return days[this.currentLang] || days['ko'];
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

// 전역 인스턴스 즉시 생성 (DOM 요소 접근 전)
window.langManager = new LanguageManager();

// DOM 준비 후 초기화
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    window.langManager.init();
  });
} else {
  // 이미 로드된 경우 즉시 초기화
  window.langManager.init();
}

// ================================
// 화면 방향 제어 (PWA standalone 모드)
// natural(기기 설정 따름) 시도 → 미지원 시 portrait 고정
// ================================
if (screen.orientation && screen.orientation.lock) {
  screen.orientation.lock('natural').catch(() => {
    screen.orientation.lock('portrait').catch(() => {});
  });
}