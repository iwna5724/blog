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

    // 변경사항 설명 언어 전환 (data-desc-ko / data-desc-ja 속성 사용)
    const changelogDescElements = document.querySelectorAll('[data-desc-ko]');
    changelogDescElements.forEach(element => {
      const ko = element.getAttribute('data-desc-ko') || '';
      const ja = element.getAttribute('data-desc-ja') || '';
      const descEl = element.querySelector('.home-changelog-desc');
      if (descEl) {
        descEl.textContent = (this.currentLang === 'ja' && ja) ? ja : ko;
      }
    });

    // 홈 post-card 필터:
    // 빌드 시 후보를 넉넉히(최대 12개) 포함해두고,
    // JS에서 언어에 맞게 4개만 표시 (data-ja-incomplete 마커 있는 카드는 일본어 모드에서 건너뜀)
    const HOME_POSTS_LIMIT = 4;
    const allCards = Array.from(document.querySelectorAll('.home-content .post-card'));
    if (allCards.length > 0) {
      // 1단계: 모든 카드 숨김
      allCards.forEach(card => { card.style.display = 'none'; });

      if (this.currentLang === 'ja') {
        // 일본어: 미완료 카드 건너뛰며 4개 표시
        let shown = 0;
        allCards.forEach(card => {
          if (shown >= HOME_POSTS_LIMIT) return;
          if (card.hasAttribute('data-ja-incomplete')) return;
          card.style.display = '';
          shown++;
        });
      } else {
        // 한국어: 순서대로 4개 표시
        allCards.slice(0, HOME_POSTS_LIMIT).forEach(card => {
          card.style.display = '';
        });
      }
    }
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
        ko: '일기',
        ja: '日記'
      },
      // 글 목록 페이지
      'lists.title': {
        ko: '일기',
        ja: '日記'
      },
      'lists.subtitle': {
        ko: '각종 기준으로 정리한 글 목록',
        ja: '各種基準で整理した投稿一覧'
      },
      'lists.calendar': {
        ko: '<span class="heading-highlight">작성일</span>로부터 찾기',
        ja: '<span class="heading-highlight">作成日</span>から探す'
      },
      'lists.type': {
        ko: '글의 <span class="heading-highlight">종류</span>로부터 찾기',
        ja: '文の<span class="heading-highlight">種類</span>から探す'
      },
      'lists.syncAdmin': {
        ko: '동기화 관리',
        ja: '同期管理'
      },
      'lists.listAdmin': {
        ko: '리스트 편집',
        ja: 'リスト編集'
      },
      'lists.listSection': {
        ko: '<span class="heading-highlight">리스트</span>에서부터 찾기',
        ja: '<span class="heading-highlight">リスト</span>から探す'
      },
      'lists.listCol.date': { ko: '작성일', ja: '作成日' },
      'lists.listCol.challenges': { ko: '도전', ja: '挑戦' },
      'lists.listCol.title': { ko: '종류・제목', ja: '種類・タイトル' },
      'lists.listCol.music': { ko: '음악', ja: '音楽' },
      'lists.tagInfoLink': { ko: 'ⓘ 각종 태그에 대해', ja: 'ⓘ 各種タグについて' },
      'lists.tagInfoSectionType': { ko: '글의 종류', ja: '文の種類' },
      'lists.tagInfoSectionChallenge': { ko: '도전', ja: '挑戦' },
      // 메인 페이지
      'hero.description': {
        ko: '<a href="https://bit.ly/iwna5724" target="_blank" class="read-more" rel="noopener noreferrer">클라우드</a>의 내용물을 구현중입니다.<br>갱신은 이 사이트에서만 이루어집니다.',
        ja: '<a href="https://bit.ly/iwna5724" target="_blank" class="read-more" rel="noopener noreferrer">クラウド</a> の中身を具現中です。<br>更新はこのサイトでのみ行われます。'
      },
      'search.placeholder': {
        ko: '검색 - 타이틀 or 날짜',
        ja: '検索 - タイトル or 日付'
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
        ko: '작성된 글이 없습니다',
        ja: '投稿がありません'
      },
      'writeFirst': {
        ko: '첫 번째 글을 작성해보세요!',
        ja: '最初の文を書いてみましょう！'
      },
      'goToWrite': {
        ko: '✍️ 글 쓰러 가기',
        ja: '✍️ 文を書く'
      },
      // 메인 페이지 — 추가 섹션
      'home.recentMusic': {
        ko: '최근 추가된 음악',
        ja: '最近追加された音楽'
      },
      'home.recentPhotos': {
        ko: '최근 사진',
        ja: '最近の写真'
      },
      'home.recentChanges': {
        ko: '패치노트',
        ja: 'パッチノート'
      },
      'home.more': {
        ko: '더 보기 →',
        ja: 'もっと見る →'
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
        ko: '음악',
        ja: '音楽'
      },
      'music.pageSubtitle': {
        ko: '<span class="subtitle-line">좋아하는 200장의 앨범</span>',
        ja: '<span class="subtitle-line">好きな200枚のアルバム</span>'
      },
      'music.infoLink': {
        ko: 'ⓘ음악 페이지에 대해',
        ja: 'ⓘ音楽ページについて'
      },
      'music.infoTooltip': {
        ko: '・앨범 커버를 클릭하면해당 앨범에 대한 정보를 확인할 수 있습니다.<br>・"CD"란, 실제 피지컬 CD를 구매한 앨범/EP를 의미합니다.<br><br>・선호도(별점)은 어디까지나 저의 주관적인 감상이며, 작품성에 대한 평가가 아닙니다.<br>・선호도는 특정한 기준 없이 매우 직감적인 판단에 따르기 때문에, 실제 선호도와 약간의 차이가 있을 수 있습니다.',
        ja: '・アルバムカバーをクリックすると、そのアルバムに関する情報を確認することができます。<br>・「CD」とは、実際にフィジカルCDを購入したアルバム/EPを意味します。<br><br>・選好度(星評価)はあくまでも自分の主観的な感想であり、作品性に対する評価ではありません。<br>・選好度特定の基準がなく、非常に直感的な判断に基づくため、実際の選好度と多少の差が生じることがあります。'
      },
      'music.artistAlbum': {
        ko: '아티스트・앨범명',
        ja: 'アーティスト・アルバム名'
      },
      'music.releaseDate': {
        ko: '발매일',
        ja: 'リリース日'
      },
      'music.addedDate': {
        ko: '추가일',
        ja: '追加日'
      },
      'music.duration': {
        ko: '재생 시간',
        ja: '再生時間'
      },
      'music.rating': {
        ko: '개인적 선호도',
        ja: '個人的選好度'
      },
      'music.tracks': {
        ko: '수록곡',
        ja: '収録曲'
      },
      'music.tracksShow': {
        ko: '수록곡 보기',
        ja: '収録曲を見る'
      },
      'music.tracksHide': {
        ko: '수록곡 닫기',
        ja: '収録曲を閉じる'
      },
      'music.favTrack': {
        ko: '최애 트랙',
        ja: '一番好きなトラック'
      },
      'music.comment': {
        ko: '코멘트',
        ja: 'コメント'
      },
      'music.openLink': {
        ko: '링크 열기',
        ja: 'リンクを開く'
      },
      'music.defaultCategory': {
        ko: '앨범',
        ja: 'アルバム'
      },
      'music.noInfo': {
        ko: '정보 없음',
        ja: '情報なし'
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
      'music.adminBtn': {
        ko: '데이터 관리',
        ja: 'データ管理'
      },
      'music.dataIntro': {
        ko: '공통: 실제와 다른 앨범이 표시되는 경우가 꽤 많음<br>(스탠다드가 아닌 디럭스 에디션이나 컴필레이션 앨범을 들은 것으로 표시되는 등)',
        ja: '共通: 実際と異なるアルバムが表示される場合が結構多い<br>(スタンダードではない、デラックスディションやコンピレーションアルバムを聴いたと表示されるなど)'
      },
      'music.dataStatsDesc': {
        ko: '・각종 통계는 오직 "재생 시간"을 기준으로 정렬됨<br>・현재 듣고 있는 곡은 표시되지 않지만, 최근에 들은 곡은 표시됨<br>・리스트의 길이가 김(top 250까지)<br>・기준 기간이 다양함(오늘, 이번주, 최근 4주 등)',
        ja: '・各種統計は「再生時間」のみを基準に整列される<br>・現在聴いている曲は表示されないが、最近聴いた曲は表示される<br>・リストの長さが長い(top 250まで)<br>・基準期間が様々(今日、今週、直近4週間など)'
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
      'music.list.addedAt': {
        ko: '추가일',
        ja: '追加日'
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
      'music.group.dur.none': {
        ko: '정보 없음',
        ja: '情報なし'
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
        ko: '정보 없음',
        ja: '情報なし'
      },
      'music.group.addedAt.phase1': { ko: '24앨범 체재', ja: '24アルバム体制' },
      'music.group.addedAt.phase2': { ko: '48앨범 체재', ja: '48アルバム体制' },
      'music.group.addedAt.phase3': { ko: '96앨범 체재', ja: '96アルバム体制' },
      'music.group.addedAt.phase4': { ko: '112앨범 체재', ja: '112アルバム体制' },
      'music.group.addedAt.phase5': { ko: '128앨범 체재', ja: '128アルバム体制' },
      'music.group.addedAt.phase6': { ko: '200앨범 체재', ja: '200アルバム体制' },
      'music.group.addedAt.unknown': { ko: '정보 없음', ja: '情報なし' },
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
      },
      // 사진 페이지
      'nav.photo': {
        ko: '사진',
        ja: '写真'
      },
      'photo.pageTitle': {
        ko: '사진',
        ja: '写真'
      },
      'photo.pageSubtitle': {
        ko: '촬영한 사진들',
        ja: '撮影した写真'
      },
      'photo.upload': {
        ko: '📷 사진 업로드',
        ja: '📷 写真アップロード'
      },
      'photo.count.prefix': {
        ko: '총',
        ja: '計'
      },
      'photo.count.suffix': {
        ko: '장',
        ja: '枚'
      },
      'photo.filter': {
        ko: '필터',
        ja: 'フィルター'
      },
      'photo.empty': {
        ko: '사진이 없습니다',
        ja: '写真がありません'
      },
      // 변경사항 페이지
      'nav.changelog': {
        ko: '패치노트',
        ja: 'パッチノート'
      },
      'changelog.pageTitle': {
        ko: '패치노트',
        ja: 'パッチノート'
      },
      'changelog.pageSubtitle': {
        ko: '사이트의 변경 이력',
        ja: 'サイトの変更履歴'
      },
      'changelog.filterAll': {
        ko: '전체',
        ja: 'すべて'
      },
      'changelog.filterBlog': {
        ko: '블로그',
        ja: 'ブログ'
      },
'changelog.filterMusic': {
        ko: '음악',
        ja: '音楽'
      },
      'changelog.empty': {
        ko: '변경사항이 없습니다',
        ja: '変更事項がありません'
      },
      'changelog.adminBtn': {
        ko: '📋 변경사항 관리',
        ja: '📋 変更事項管理'
      },
      'changelog.infoLink': {
        ko: 'ⓘ 패치노트에 대해',
        ja: 'ⓘ パッチノートについて'
      },
      // 글 태그 툴팁 (post.html)
      'post.tag.✏️': {
        ko: '사실상 일기라고는 할 수 없는 수준의 글',
        ja: '事実上、日記とは言えない水準の文'
      },
      'post.tag.📝': {
        ko: '최소한의 분량은 작성한 글',
        ja: '最低限の分量は作成した文'
      },
      'post.tag.⭐': {
        ko: '중요도가 높은 글',
        ja: '重要度の高い文'
      },
      'post.tag.💀': {
        ko: '구 RTS(삭제 예정)',
        ja: '旧RTS(削除予定)'
      },
      'post.tag.🦆': {
        ko: '비공개글',
        ja: '非公開文'
      },
      // 도전 태그 툴팁 (post.html)
      'post.challenge.🛌': {
        ko: '10시 28분 전에 취침',
        ja: '10時28分前に就寝'
      },
      'post.challenge.🚶': {
        ko: '외출',
        ja: '外出'
      },
      'post.challenge.📖': {
        ko: '독서',
        ja: '読書'
      },
      'post.challenge.🎸': {
        ko: '기타 연습',
        ja: 'ギター練習'
      },
      'post.challenge.🏋️': {
        ko: '운동',
        ja: '運動'
      },
      'post.challenge.🎓': {
        ko: '공부(과제 등 포함)',
        ja: '勉強(課題などを含む)'
      },
      'changelog.infoTooltip': {
        ko: '・날짜를 클릭하면 해당 날짜의 변경사항을 펼치거나 접을 수 있습니다.<br>・필터 버튼으로 카테고리별 항목을 선택해서 볼 수 있습니다.<br>・🔗/📄 링크를 클릭하면 해당 커밋/일기를 확인할 수 있습니다.<br><br>・변경사항은 26/02/18 이후의 내용만 기록됩니다.<br>・또한, 변경사항 페이지에는 열람자 입장에서 체감 가능한 내용만 기록됩니다.<br>・버그 수정 등의 기타 변경사항은 <a href="https://github.com/iwna5724/blog/actions/workflows/deploy.yml" target="_blank" class="read-more" rel="noopener noreferrer">깃허브(2026년 이후)</a> 혹은 <a href="https://bit.ly/iwna5724" target="_blank" class="read-more" rel="noopener noreferrer">클라우드(2025년 이전)</a>에서 확인 가능합니다.',
        ja: '・日付をクリックすると、その日付の変更事項を展開・折りたたむことができます。<br>・フィルターボタンでカテゴリーごとに表示できます。<br>・🔗/📄リンクをクリックすると、該当コミット/日記を確認できます。<br><br>・変更事項は26/02/18以降の内容のみ記録されます。<br>・また、変更事項ページでは閲覧者側で体感できる内容のみ記録されます。<br>・バク修正などその他の変更事項は<a href="https://github.com/iwna5724/blog/actions/workflows/deploy.yml" target="_blank" class="read-more" rel="noopener noreferrer">Github(2026年以降)</a>または<a href="https://bit.ly/iwna5724" target="_blank" class="read-more" rel="noopener noreferrer">クラウド(2025年以前)</a>から確認できます(韓国語のみ)。'
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