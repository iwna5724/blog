/**
 * 인증 관리 (Authentication)
 * GitHub 토큰 저장, 검증, 로그인/로그아웃 처리
 */

class Auth {
  constructor() {
    this.TOKEN_KEY = 'github_token';
    this.CONFIG_KEY = 'github_config';

    // ⚠️ 암호화된 토큰을 여기에 입력하세요
    // CryptoJS.AES.encrypt('ghp_실제토큰', '비밀번호').toString() 의 결과값
    this.ENCRYPTED_TOKEN = 'dbCQAhr5RHvjsv8kRVi+l+JfCZkXeivzebcUILQW283ALUB1Zp5MO/MBh9rKxn2P';
  }

  /**
   * 비밀번호로 토큰 복호화
   * @param {string} password - 복호화 비밀번호
   * @returns {string|null} 복호화된 토큰 또는 null (실패 시)
   */
  decryptToken(password) {
    try {
      // aes-modal.js와 동일한 방식으로 복호화 (CBC 모드, 빈 IV)
      const cipherParams = CryptoJS.lib.CipherParams.create({
        ciphertext: CryptoJS.enc.Base64.parse(this.ENCRYPTED_TOKEN)
      });

      const bytes = CryptoJS.AES.decrypt(cipherParams, CryptoJS.enc.Utf8.parse(password), {
        iv: CryptoJS.enc.Utf8.parse(""),
        mode: CryptoJS.mode.CBC,
        padding: CryptoJS.pad.Pkcs7,
        keySize: 128 / 32
      });

      const decrypted = bytes.toString(CryptoJS.enc.Utf8);

      // 복호화 실패 시 빈 문자열 반환됨
      if (!decrypted || !decrypted.startsWith('ghp_')) {
        return null;
      }
      return decrypted;
    } catch (error) {
      // 비밀번호가 틀리면 Malformed UTF-8 에러 발생 (정상 동작)
      return null;
    }
  }

  /**
   * 로그인 - 토큰 저장
   * @param {string} token - GitHub Personal Access Token
   * @param {Object} config - GitHub 설정 (owner, repo, branch)
   * @returns {boolean} 저장 성공 여부
   */
  login(token, config) {
    try {
      localStorage.setItem(this.TOKEN_KEY, token);
      localStorage.setItem(this.CONFIG_KEY, JSON.stringify(config));
      return true;
    } catch (error) {
      console.error('Failed to save token:', error);
      return false;
    }
  }

  /**
   * 로그아웃 - 토큰 삭제
   */
  logout() {
    localStorage.removeItem(this.TOKEN_KEY);
    localStorage.removeItem(this.CONFIG_KEY);
    window.location.href = './login.html';
  }

  /**
   * 저장된 토큰 가져오기
   * @returns {string|null} GitHub 토큰
   */
  getToken() {
    return localStorage.getItem(this.TOKEN_KEY);
  }

  /**
   * 저장된 설정 가져오기
   * @returns {Object|null} GitHub 설정
   */
  getConfig() {
    const config = localStorage.getItem(this.CONFIG_KEY);
    return config ? JSON.parse(config) : null;
  }

  /**
   * 로그인 여부 확인
   * @returns {boolean} 로그인 상태
   */
  isLoggedIn() {
    return this.getToken() !== null;
  }

  /**
   * 토큰 유효성 검증
   * @param {string} token - 검증할 토큰
   * @returns {Promise<boolean>} 유효성 여부
   */
  async verifyToken(token) {
    try {
      const response = await fetch('https://api.github.com/user', {
        headers: {
          'Authorization': `token ${token}`,
          'Accept': 'application/vnd.github.v3+json'
        }
      });

      return response.ok;
    } catch (error) {
      console.error('Token verification failed:', error);
      return false;
    }
  }

  /**
   * 인증이 필요한 페이지에서 호출
   * 로그인하지 않은 경우 로그인 페이지로 리다이렉트
   * @returns {string|null} 토큰 (로그인된 경우)
   */
  requireAuth() {
    const token = this.getToken();
    
    if (!token) {
      // 현재 페이지 URL을 저장 (로그인 후 돌아오기 위해)
      const returnUrl = window.location.pathname + window.location.search;
      localStorage.setItem('return_url', returnUrl);
      
      window.location.href = './login.html';
      return null;
    }
    
    return token;
  }

  /**
   * 로그인 후 원래 페이지로 돌아가기
   */
  returnToPreviousPage() {
    const returnUrl = localStorage.getItem('return_url');
    localStorage.removeItem('return_url');
    
    if (returnUrl) {
      window.location.href = returnUrl;
    } else {
      window.location.href = './index.html';
    }
  }

  /**
   * 토큰과 저장소 권한 확인
   * @param {string} token - 확인할 토큰
   * @param {Object} config - 저장소 설정
   * @returns {Promise<Object>} { valid: boolean, user: Object, error: string }
   */
  async validateCredentials(token, config) {
    try {
      // 1. 사용자 정보 확인
      const userResponse = await fetch('https://api.github.com/user', {
        headers: {
          'Authorization': `token ${token}`,
          'Accept': 'application/vnd.github.v3+json'
        }
      });

      if (!userResponse.ok) {
        return {
          valid: false,
          error: '유효하지 않은 토큰입니다.'
        };
      }

      const user = await userResponse.json();

      // 2. 저장소 접근 권한 확인
      const repoResponse = await fetch(
        `https://api.github.com/repos/${config.owner}/${config.repo}`,
        {
          headers: {
            'Authorization': `token ${token}`,
            'Accept': 'application/vnd.github.v3+json'
          }
        }
      );

      if (!repoResponse.ok) {
        return {
          valid: false,
          error: '저장소에 접근할 수 없습니다. 저장소 설정을 확인해주세요.'
        };
      }

      const repo = await repoResponse.json();

      // 3. 쓰기 권한 확인
      if (!repo.permissions || !repo.permissions.push) {
        return {
          valid: false,
          error: '저장소에 쓰기 권한이 없습니다.'
        };
      }

      return {
        valid: true,
        user: user,
        repo: repo
      };

    } catch (error) {
      console.error('Credential validation error:', error);
      return {
        valid: false,
        error: '네트워크 오류가 발생했습니다.'
      };
    }
  }

  /**
   * 현재 로그인한 사용자 정보 가져오기
   * @returns {Promise<Object|null>} 사용자 정보
   */
  async getCurrentUser() {
    const token = this.getToken();
    
    if (!token) {
      return null;
    }

    try {
      const response = await fetch('https://api.github.com/user', {
        headers: {
          'Authorization': `token ${token}`,
          'Accept': 'application/vnd.github.v3+json'
        }
      });

      if (!response.ok) {
        return null;
      }

      return await response.json();
    } catch (error) {
      console.error('Failed to get current user:', error);
      return null;
    }
  }
}

// 전역 인스턴스 생성
const auth = new Auth();

// 간편 사용을 위한 함수들
function checkAuth() {
  return auth.requireAuth();
}

function logout() {
  auth.logout();
}

function isLoggedIn() {
  return auth.isLoggedIn();
}

// export
if (typeof module !== 'undefined' && module.exports) {
  module.exports = Auth;
}