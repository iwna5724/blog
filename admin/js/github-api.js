/**
 * GitHub API 클래스
 * GitHub 저장소의 파일을 읽고, 쓰고, 삭제하는 기능 제공
 */
class GitHubAPI {
  constructor(token, config) {
    this.token = token;
    this.config = config || {};
    this.baseUrl = 'https://api.github.com';
    this.owner = this.config.owner;
    this.repo = this.config.repo;
    this.branch = this.config.branch || 'main';
  }

  /**
   * API 요청 헤더 생성
   */
  getHeaders() {
    const headers = {
      'Accept': 'application/vnd.github.v3+json',
      'Content-Type': 'application/json'
    };
    
    // 토큰이 있을 때만 Authorization 헤더 추가
    if (this.token && this.token.trim() !== '') {
      headers['Authorization'] = `token ${this.token}`;
    }
    
    return headers;
  }

  /**
   * 특정 경로의 파일/폴더 목록 가져오기
   * @param {string} path - 조회할 경로 (예: 'content')
   * @returns {Promise<Array>} 파일 목록
   */
  async listFiles(path = '') {
    const url = `${this.baseUrl}/repos/${this.owner}/${this.repo}/contents/${path}`;
    
    try {
      console.log('[DEBUG] Fetching:', url);
      console.log('[DEBUG] Token exists:', !!this.token);
      
      const response = await fetch(url, {
        headers: this.getHeaders(),
        cache: 'no-cache',  // 브라우저 캐시 사용 안 함
        mode: 'cors'  // CORS 명시적 설정
      });

      console.log('[DEBUG] Response status:', response.status);

      // 401 Unauthorized - 토큰 만료 또는 유효하지 않음
      if (response.status === 401) {
        console.warn('Token is invalid or expired. Clearing token...');
        localStorage.removeItem('github_token');
        this.token = ''; // 토큰 제거
        
        // 토큰 없이 재시도 (public 저장소인 경우 작동)
        console.log('[DEBUG] Retrying without token...');
        const retryResponse = await fetch(url, {
          headers: this.getHeaders(),
          cache: 'no-cache',
          mode: 'cors'
        });
        
        if (!retryResponse.ok) {
          throw new Error(`Failed to list files: ${retryResponse.statusText}`);
        }
        
        return await retryResponse.json();
      }

      if (!response.ok) {
        throw new Error(`Failed to list files: ${response.statusText}`);
      }

      const data = await response.json();
      console.log('[DEBUG] Files loaded:', data.length);
      return data;
      
    } catch (error) {
      console.error('[DEBUG] Error details:', {
        message: error.message,
        stack: error.stack,
        url: url,
        token: this.token ? 'exists' : 'none'
      });
      
      // CORS 에러인 경우 localStorage 정리 시도
      if (error.message.includes('fetch') || error.message.includes('CORS')) {
        console.warn('[DEBUG] Possible CORS/token issue, clearing localStorage...');
        localStorage.removeItem('github_token');
        this.token = '';
      }
      
      throw error;
    }
  }

  /**
   * 특정 파일의 내용 가져오기
   * @param {string} path - 파일 경로 (예: 'content/2024-01-01-post.md')
   * @returns {Promise<Object>} { content: 디코딩된 내용, sha: 파일 해시 }
   */
  async getFile(path) {
    const url = `${this.baseUrl}/repos/${this.owner}/${this.repo}/contents/${path}`;
    
    try {
      const response = await fetch(url, {
        headers: this.getHeaders(),
        cache: 'no-cache'  // 브라우저 캐시 사용 안 함
      });

      // 401 Unauthorized - 토큰 만료 또는 유효하지 않음
      if (response.status === 401) {
        console.warn('Token is invalid or expired. Clearing token...');
        localStorage.removeItem('github_token');
        this.token = ''; // 토큰 제거
        
        // 토큰 없이 재시도 (public 저장소인 경우 작동)
        const retryResponse = await fetch(url, {
          headers: this.getHeaders(),
          cache: 'no-cache'
        });
        
        if (!retryResponse.ok) {
          throw new Error(`Failed to get file: ${retryResponse.statusText}`);
        }
        
        const data = await retryResponse.json();
        return {
          content: this.decodeBase64(data.content),
          sha: data.sha
        };
      }

      if (!response.ok) {
        throw new Error(`Failed to get file: ${response.statusText}`);
      }

      const data = await response.json();
      
      // Base64 디코딩 (UTF-8 지원)
      const content = this.decodeBase64(data.content);
      
      return {
        content: content,
        sha: data.sha,
        size: data.size,
        path: data.path
      };
    } catch (error) {
      console.error('Error getting file:', error);
      throw error;
    }
  }

  /**
   * 파일 생성 또는 수정
   * @param {string} path - 파일 경로
   * @param {string} content - 파일 내용
   * @param {string} message - 커밋 메시지
   * @param {string|null} sha - 수정 시 기존 파일의 sha (생성 시 null)
   * @returns {Promise<Object>} 생성/수정 결과
   */
  async saveFile(path, content, message, sha = null) {
    const url = `${this.baseUrl}/repos/${this.owner}/${this.repo}/contents/${path}`;
    
    const body = {
      message: message,
      content: this.encodeBase64(content),
      branch: this.branch
    };

    // 수정인 경우 sha 추가
    if (sha) {
      body.sha = sha;
    }

    try {
      const response = await fetch(url, {
        method: 'PUT',
        headers: this.getHeaders(),
        body: JSON.stringify(body)
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(`Failed to save file: ${error.message || response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error saving file:', error);
      throw error;
    }
  }

  /**
   * 파일 삭제
   * @param {string} path - 파일 경로
   * @param {string} sha - 파일의 sha (필수)
   * @param {string} message - 커밋 메시지
   * @returns {Promise<Object>} 삭제 결과
   */
  async deleteFile(path, sha, message = null) {
    const url = `${this.baseUrl}/repos/${this.owner}/${this.repo}/contents/${path}`;
    
    const defaultMessage = message || `Delete ${path}`;

    try {
      const response = await fetch(url, {
        method: 'DELETE',
        headers: this.getHeaders(),
        body: JSON.stringify({
          message: defaultMessage,
          sha: sha,
          branch: this.branch
        })
      });

      if (!response.ok) {
        throw new Error(`Failed to delete file: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error deleting file:', error);
      throw error;
    }
  }

  /**
   * UTF-8 문자열을 Base64로 인코딩 (한글 지원)
   * @param {string} str - 인코딩할 문자열
   * @returns {string} Base64 인코딩된 문자열
   */
  encodeBase64(str) {
    // UTF-8로 인코딩 후 Base64 변환
    return btoa(unescape(encodeURIComponent(str)));
  }

  /**
   * Base64를 UTF-8 문자열로 디코딩 (한글 지원)
   * @param {string} base64 - Base64 문자열
   * @returns {string} 디코딩된 문자열
   */
  decodeBase64(base64) {
    // 줄바꿈 제거 후 디코딩
    const cleaned = base64.replace(/\n/g, '');
    return decodeURIComponent(escape(atob(cleaned)));
  }

  /**
   * 현재 인증된 사용자 정보 가져오기
   * @returns {Promise<Object>} 사용자 정보
   */
  async getUser() {
    const url = `${this.baseUrl}/user`;
    
    try {
      const response = await fetch(url, {
        headers: this.getHeaders()
      });

      if (!response.ok) {
        throw new Error('Authentication failed');
      }

      return await response.json();
    } catch (error) {
      console.error('Error getting user:', error);
      throw error;
    }
  }

  /**
   * 저장소 정보 가져오기
   * @returns {Promise<Object>} 저장소 정보
   */
  async getRepo() {
    const url = `${this.baseUrl}/repos/${this.owner}/${this.repo}`;
    
    try {
      const response = await fetch(url, {
        headers: this.getHeaders()
      });

      if (!response.ok) {
        throw new Error('Failed to get repository');
      }

      return await response.json();
    } catch (error) {
      console.error('Error getting repo:', error);
      throw error;
    }
  }

  /**
   * 파일 존재 여부 확인
   * @param {string} path - 확인할 파일 경로
   * @returns {Promise<boolean>} 파일 존재 여부
   */
  async fileExists(path) {
    try {
      await this.getFile(path);
      return true;
    } catch (error) {
      return false;
    }
  }
}

// 전역으로 사용 가능하도록 export
if (typeof module !== 'undefined' && module.exports) {
  module.exports = GitHubAPI;
}
