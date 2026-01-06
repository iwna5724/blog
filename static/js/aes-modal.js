/**
 * AES 암호화 모달
 * 모드: 'full' (전체), 'decrypt-only' (복호화만)
 */

const AESModal = {
  mode: 'full', // 기본 모드
  
  // 모달 HTML 생성
  createModal() {
    const modal = document.createElement('div');
    modal.className = 'aes-modal-overlay';
    modal.id = 'aes-modal';
    modal.innerHTML = `
      <div class="aes-modal-container">
        <div class="aes-modal-header">
          <h2 class="aes-modal-title" data-i18n="aes.title">🔐 AES 암호화 도구</h2>
          <button class="aes-modal-close" onclick="AESModal.close()" aria-label="닫기">×</button>
        </div>
        <div class="aes-modal-body">
          <!-- 평문 (전체 모드에만 표시) -->
          <div class="aes-form-group" id="aes-plaintext-group">
            <label class="aes-label" for="aes-plaintext" data-i18n="aes.plaintext">평문 (Plain Text)</label>
            <textarea class="aes-textarea" id="aes-plaintext" data-i18n-placeholder="aes.plaintextPlaceholder" placeholder="암호화할 텍스트를 입력하세요"></textarea>
          </div>

          <!-- 암호화 키 -->
          <div class="aes-form-group">
            <label class="aes-label" for="aes-key" data-i18n="aes.key">암호화 키 (Secret Key)</label>
            <input type="password" class="aes-input" id="aes-key" data-i18n-placeholder="aes.keyPlaceholder" placeholder="암호화/복호화에 사용할 키를 입력하세요">
          </div>

          <!-- 버튼 그룹 -->
          <div class="aes-button-group" id="aes-buttons">
            <button class="aes-button" id="aes-encrypt-btn" onclick="AESModal.encrypt()" data-i18n="aes.encryptBtn">🔒 암호화</button>
            <button class="aes-button" onclick="AESModal.decrypt()" data-i18n="aes.decryptBtn">🔓 복호화</button>
          </div>

          <!-- 암호문 -->
          <div class="aes-form-group">
            <label class="aes-label" for="aes-ciphertext" data-i18n="aes.ciphertext">암호문 (Cipher Text)</label>
            <textarea class="aes-textarea" id="aes-ciphertext" data-i18n-placeholder="aes.ciphertextPlaceholder" placeholder="암호화된 텍스트가 여기에 표시되거나 직접 입력하세요"></textarea>
          </div>

          <!-- 복호화된 텍스트 -->
          <div class="aes-form-group">
            <label class="aes-label" for="aes-decryptedtext" data-i18n="aes.decryptedtext">복호화된 텍스트 (Decrypted Text)</label>
            <textarea class="aes-textarea" id="aes-decryptedtext" data-i18n-placeholder="aes.decryptedtextPlaceholder" placeholder="복호화된 텍스트가 여기에 표시됩니다" readonly></textarea>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    
    // ESC 키로 닫기
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && modal.classList.contains('active')) {
        this.close();
      }
    });
  },
  
  // 모달 열기
  open(mode = 'full') {
    this.mode = mode;
    
    let modal = document.getElementById('aes-modal');
    if (!modal) {
      this.createModal();
      modal = document.getElementById('aes-modal');
    }
    
    // 모드에 따라 UI 조정
    if (mode === 'decrypt-only') {
      document.getElementById('aes-plaintext-group').classList.add('hidden');
      document.getElementById('aes-encrypt-btn').style.display = 'none';
      
      // 코드블록에서 암호문 자동 추출
      this.extractCiphertextFromCodeBlock();
    } else {
      document.getElementById('aes-plaintext-group').classList.remove('hidden');
      document.getElementById('aes-encrypt-btn').style.display = 'block';
    }
    
    // 언어에 맞게 번역 적용
    if (window.langManager) {
      window.langManager.updateContent();
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
  
  // 코드블록에서 암호문 자동 추출
  extractCiphertextFromCodeBlock() {
    // post-content 내의 모든 코드블록 찾기
    const postContent = document.querySelector('.post-content:not([style*="display: none"])');
    if (!postContent) return;
    
    const codeBlocks = postContent.querySelectorAll('pre code');
    if (codeBlocks.length === 0) return;
    
    // 코드블록이 하나만 있으면 그것을 사용
    if (codeBlocks.length === 1) {
      const ciphertext = codeBlocks[0].textContent.trim();
      document.getElementById('aes-ciphertext').value = ciphertext;
      return;
    }
    
    // 여러 개가 있으면 Base64 형식으로 보이는 것을 찾음
    for (const block of codeBlocks) {
      const text = block.textContent.trim();
      // Base64 패턴 확인 (영문자, 숫자, +, /, =로만 구성)
      if (/^[A-Za-z0-9+/]+=*$/.test(text) && text.length > 20) {
        document.getElementById('aes-ciphertext').value = text;
        return;
      }
    }
  },
  
  // 필드 초기화
  clearFields() {
    document.getElementById('aes-plaintext').value = '';
    document.getElementById('aes-key').value = '';
    document.getElementById('aes-ciphertext').value = '';
    document.getElementById('aes-decryptedtext').value = '';
  },
  
  // 암호화 함수 (CBC 모드, 128-bit, Base64 출력, 빈 IV)
  encrypt() {
    try {
      const plaintext = document.getElementById('aes-plaintext').value;
      const key = document.getElementById('aes-key').value;
      
      if (!plaintext) {
        alert('평문을 입력해주세요.');
        return;
      }
      
      if (!key) {
        alert('암호화 키를 입력해주세요.');
        return;
      }
      
      // CBC 모드로 암호화 (빈 IV 사용)
      const cipher = CryptoJS.AES.encrypt(plaintext, CryptoJS.enc.Utf8.parse(key), {
        iv: CryptoJS.enc.Utf8.parse(""),
        mode: CryptoJS.mode.CBC,
        padding: CryptoJS.pad.Pkcs7,
        keySize: 128 / 32
      });
      
      // ciphertext만 추출하여 Base64로 변환
      const encrypted = cipher.ciphertext;
      document.getElementById('aes-ciphertext').value = CryptoJS.enc.Base64.stringify(encrypted);
      
      // 복호화 필드 초기화
      document.getElementById('aes-decryptedtext').value = '';
      
    } catch (error) {
      alert('암호화 중 오류가 발생했습니다: ' + error.message);
    }
  },
  
  // 복호화 함수
  decrypt() {
    try {
      const ciphertext = document.getElementById('aes-ciphertext').value;
      const key = document.getElementById('aes-key').value;
      
      if (!ciphertext) {
        alert('암호문이 없습니다.');
        return;
      }
      
      if (!key) {
        alert('복호화 키를 입력해주세요.');
        return;
      }
      
      // Base64 암호문을 CipherParams 객체로 변환
      const cipherParams = CryptoJS.lib.CipherParams.create({
        ciphertext: CryptoJS.enc.Base64.parse(ciphertext)
      });
      
      // CBC 모드로 복호화 (빈 IV 사용)
      const decrypted = CryptoJS.AES.decrypt(cipherParams, CryptoJS.enc.Utf8.parse(key), {
        iv: CryptoJS.enc.Utf8.parse(""),
        mode: CryptoJS.mode.CBC,
        padding: CryptoJS.pad.Pkcs7,
        keySize: 128 / 32
      });
      
      const decryptedText = decrypted.toString(CryptoJS.enc.Utf8);
      
      if (!decryptedText) {
        alert('복호화에 실패했습니다. 올바른 키를 입력했는지 확인해주세요.');
        return;
      }
      
      document.getElementById('aes-decryptedtext').value = decryptedText;
      
    } catch (error) {
      alert('복호화 중 오류가 발생했습니다. 올바른 키를 입력했는지 확인해주세요.');
    }
  }
};