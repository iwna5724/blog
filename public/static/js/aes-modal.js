/**
 * AES 암호화 모달
 * 모드: 'full' (전체), 'decrypt-only' (복호화만)
 * 2중 암호화 지원: 1차 암호키 (게시글 암호문), 2차 암호키 (내부 암호문)
 */

const AESModal = {
  mode: 'full', // 기본 모드

  // localStorage 키
  KEY1_STORAGE: 'aes_key1',
  KEY2_STORAGE: 'aes_key2',

  // 번역 텍스트 가져오기
  t(key) {
    if (window.langManager && typeof window.langManager.getUIText === 'function') {
      return window.langManager.getUIText(key);
    }
    // fallback (langManager 없을 경우)
    const fallback = {
      'aes.title': '🔐 AES 암호화 도구',
      'aes.key1.label': '1차 암호키',
      'aes.key1.placeholder': '게시글 암호문용',
      'aes.key2.label': '2차 암호키',
      'aes.key2.placeholder': '내부 암호문용',
      'aes.decrypt': '🔓 복호화',
      'aes.decryptedText': '복호화된 텍스트',
      'aes.error.noKey': '1차 암호키와 2차 암호키를 모두 입력해주세요.',
      'aes.error.noCiphertext': '암호문이 없습니다.',
      'aes.error.key1Failed': '1차 복호화에 실패했습니다. 1차 암호키를 확인해주세요.',
      'aes.error.key2Failed': '2차 복호화에 실패했습니다. 2차 암호키를 확인해주세요.',
      'aes.error.general': '복호화 중 오류가 발생했습니다. 암호키를 확인해주세요.'
    };
    return fallback[key] || key;
  },

  // 모달 HTML 생성 (번역 없이 기본 구조만)
  createModal() {
    const modal = document.createElement('div');
    modal.className = 'aes-modal-overlay';
    modal.id = 'aes-modal';
    modal.innerHTML = `
      <div class="aes-modal-container">
        <div class="aes-modal-header">
          <h2 class="aes-modal-title" id="aes-modal-title"></h2>
          <button class="aes-modal-close" onclick="AESModal.close()" aria-label="닫기">×</button>
        </div>
        <div class="aes-modal-body">
          <!-- 평문 (전체 모드에만 표시) -->
          <div class="aes-form-group" id="aes-plaintext-group">
            <label class="aes-label" for="aes-plaintext">평문 (Plain Text)</label>
            <textarea class="aes-textarea" id="aes-plaintext" placeholder="암호화할 텍스트를 입력하세요"></textarea>
          </div>

          <!-- 암호화 키 그룹 -->
          <div class="aes-key-group">
            <div class="aes-form-group aes-key-item">
              <label class="aes-label" for="aes-key1" id="aes-key1-label"></label>
              <input type="password" class="aes-input" id="aes-key1">
            </div>
            <div class="aes-form-group aes-key-item">
              <label class="aes-label" for="aes-key2" id="aes-key2-label"></label>
              <input type="password" class="aes-input" id="aes-key2">
            </div>
          </div>

          <!-- 버튼 그룹 -->
          <div class="aes-button-group" id="aes-buttons">
            <button class="aes-button" id="aes-encrypt-btn" onclick="AESModal.encrypt()">🔒 암호화</button>
            <button class="aes-button" id="aes-decrypt-btn" onclick="AESModal.decrypt()"></button>
          </div>

          <!-- 암호문 (전체 모드에만 표시) -->
          <div class="aes-form-group" id="aes-ciphertext-group">
            <label class="aes-label" for="aes-ciphertext">암호문 (Cipher Text)</label>
            <textarea class="aes-textarea" id="aes-ciphertext" placeholder="암호화된 텍스트가 여기에 표시되거나 직접 입력하세요"></textarea>
          </div>

          <!-- 복호화된 텍스트 -->
          <div class="aes-form-group">
            <label class="aes-label" for="aes-decryptedtext" id="aes-decryptedtext-label"></label>
            <textarea class="aes-textarea aes-textarea-auto" id="aes-decryptedtext" placeholder="" readonly></textarea>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    // 오버레이 클릭 시 닫기 (드래그로 인한 오작동 방지)
    let mouseDownTarget = null;
    modal.addEventListener('mousedown', (e) => {
      mouseDownTarget = e.target;
    });
    modal.addEventListener('click', (e) => {
      // mousedown과 click 모두 오버레이에서 발생한 경우에만 닫기
      if (e.target === modal && mouseDownTarget === modal) {
        this.close();
      }
    });

    // ESC 키로 닫기
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && modal.classList.contains('active')) {
        this.close();
      }
    });

    // 키 입력 시 localStorage에 저장
    document.getElementById('aes-key1').addEventListener('input', (e) => {
      localStorage.setItem(this.KEY1_STORAGE, e.target.value);
    });
    document.getElementById('aes-key2').addEventListener('input', (e) => {
      localStorage.setItem(this.KEY2_STORAGE, e.target.value);
    });
  },

  // 모달의 번역 텍스트 업데이트 (열 때마다 호출)
  updateTranslations() {
    document.getElementById('aes-modal-title').textContent = this.t('aes.title');
    document.getElementById('aes-key1-label').textContent = this.t('aes.key1.label');
    document.getElementById('aes-key1').placeholder = this.t('aes.key1.placeholder');
    document.getElementById('aes-key2-label').textContent = this.t('aes.key2.label');
    document.getElementById('aes-key2').placeholder = this.t('aes.key2.placeholder');
    document.getElementById('aes-decrypt-btn').textContent = this.t('aes.decrypt');
    document.getElementById('aes-decryptedtext-label').textContent = this.t('aes.decryptedText');
  },

  // 모달 열기
  open(mode = 'full') {
    this.mode = mode;

    let modal = document.getElementById('aes-modal');
    if (!modal) {
      this.createModal();
      modal = document.getElementById('aes-modal');
    }

    // 번역 텍스트 업데이트 (열 때마다 최신 번역 적용)
    this.updateTranslations();

    // 모드에 따라 UI 조정
    if (mode === 'decrypt-only') {
      document.getElementById('aes-plaintext-group').classList.add('hidden');
      document.getElementById('aes-ciphertext-group').classList.add('hidden');
      document.getElementById('aes-encrypt-btn').style.display = 'none';
    } else {
      document.getElementById('aes-plaintext-group').classList.remove('hidden');
      document.getElementById('aes-ciphertext-group').classList.remove('hidden');
      document.getElementById('aes-encrypt-btn').style.display = 'block';
    }

    // 필드 초기화 (키는 localStorage에서 복원)
    this.clearFields();
    this.loadKeys();

    // 🦆 모드: 코드블록에서 암호문 자동 로드
    if (mode === 'decrypt-only') {
      this.loadCiphertextFromCodeblock();
    }

    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
  },

  // 모달 닫기
  close() {
    const modal = document.getElementById('aes-modal');
    if (modal) {
      modal.classList.remove('active');
      document.body.style.overflow = '';
    }
  },

  // 필드 초기화
  clearFields() {
    document.getElementById('aes-plaintext').value = '';
    document.getElementById('aes-ciphertext').value = '';
    document.getElementById('aes-decryptedtext').value = '';
    this.autoResizeTextarea(document.getElementById('aes-decryptedtext'));
  },

  // localStorage에서 키 복원
  loadKeys() {
    const key1 = localStorage.getItem(this.KEY1_STORAGE) || '';
    const key2 = localStorage.getItem(this.KEY2_STORAGE) || '';
    document.getElementById('aes-key1').value = key1;
    document.getElementById('aes-key2').value = key2;
  },

  // 코드블록에서 암호문 자동 로드 (현재 언어에 맞는 콘텐츠에서)
  loadCiphertextFromCodeblock() {
    // 현재 언어 확인
    const currentLang = window.langManager ? window.langManager.getLanguage() : 'ko';

    // 해당 언어의 콘텐츠 영역에서 코드블록 찾기
    const contentId = currentLang === 'ja' ? 'post-content-ja' : 'post-content-ko';
    const contentArea = document.getElementById(contentId);

    if (contentArea) {
      const codeBlock = contentArea.querySelector('pre code');
      if (codeBlock) {
        const ciphertext = codeBlock.textContent.trim();
        if (ciphertext) {
          document.getElementById('aes-ciphertext').value = ciphertext;
        }
      }
    }
  },

  // textarea 자동 높이 조절
  autoResizeTextarea(textarea) {
    textarea.style.height = 'auto';
    textarea.style.height = Math.max(100, textarea.scrollHeight) + 'px';
  },

  // 단일 AES 암호화 (내부 함수)
  _encryptSingle(plaintext, key) {
    const cipher = CryptoJS.AES.encrypt(plaintext, CryptoJS.enc.Utf8.parse(key), {
      iv: CryptoJS.enc.Utf8.parse(""),
      mode: CryptoJS.mode.CBC,
      padding: CryptoJS.pad.Pkcs7,
      keySize: 128 / 32
    });
    return CryptoJS.enc.Base64.stringify(cipher.ciphertext);
  },

  // 단일 AES 복호화 (내부 함수)
  _decryptSingle(ciphertext, key) {
    const cipherParams = CryptoJS.lib.CipherParams.create({
      ciphertext: CryptoJS.enc.Base64.parse(ciphertext)
    });
    const decrypted = CryptoJS.AES.decrypt(cipherParams, CryptoJS.enc.Utf8.parse(key), {
      iv: CryptoJS.enc.Utf8.parse(""),
      mode: CryptoJS.mode.CBC,
      padding: CryptoJS.pad.Pkcs7,
      keySize: 128 / 32
    });
    return decrypted.toString(CryptoJS.enc.Utf8);
  },

  // 암호화 함수 (2중 암호화: 평문 → 2차키 → 1차키)
  encrypt() {
    try {
      const plaintext = document.getElementById('aes-plaintext').value;
      const key1 = document.getElementById('aes-key1').value;
      const key2 = document.getElementById('aes-key2').value;

      if (!plaintext) {
        alert('평문을 입력해주세요.');
        return;
      }

      if (!key1 || !key2) {
        alert(this.t('aes.error.noKey'));
        return;
      }

      // 2중 암호화: 평문 → 2차키 암호화 → 1차키 암호화
      const firstEncrypted = this._encryptSingle(plaintext, key2);
      const finalEncrypted = this._encryptSingle(firstEncrypted, key1);

      document.getElementById('aes-ciphertext').value = finalEncrypted;
      document.getElementById('aes-decryptedtext').value = '';
      this.autoResizeTextarea(document.getElementById('aes-decryptedtext'));

    } catch (error) {
      alert('암호화 중 오류가 발생했습니다: ' + error.message);
    }
  },

  // 복호화 함수 (2중 복호화: 암호문 → 1차키 → 2차키)
  decrypt() {
    try {
      const ciphertext = document.getElementById('aes-ciphertext').value.trim();
      const key1 = document.getElementById('aes-key1').value;
      const key2 = document.getElementById('aes-key2').value;

      if (!ciphertext) {
        alert(this.t('aes.error.noCiphertext'));
        return;
      }

      if (!key1 || !key2) {
        alert(this.t('aes.error.noKey'));
        return;
      }

      // 2중 복호화: 암호문 → 1차키 복호화 → 2차키 복호화
      const firstDecrypted = this._decryptSingle(ciphertext, key1);
      if (!firstDecrypted) {
        alert(this.t('aes.error.key1Failed'));
        return;
      }

      const finalDecrypted = this._decryptSingle(firstDecrypted, key2);
      if (!finalDecrypted) {
        alert(this.t('aes.error.key2Failed'));
        return;
      }

      const textarea = document.getElementById('aes-decryptedtext');
      textarea.value = finalDecrypted;
      this.autoResizeTextarea(textarea);

    } catch (error) {
      alert(this.t('aes.error.general'));
    }
  }
};
