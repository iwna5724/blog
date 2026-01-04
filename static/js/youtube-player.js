/**
 * YouTube 플레이어 상태 관리
 * 언어 전환 시 재생 상태 유지
 */

class YouTubePlayerManager {
  constructor() {
    this.players = {};
    this.apiReady = false;
    this.init();
  }

  /**
   * 초기화
   */
  init() {
    // YouTube IFrame API 로드
    if (!window.YT) {
      const tag = document.createElement('script');
      tag.src = 'https://www.youtube.com/iframe_api';
      const firstScriptTag = document.getElementsByTagName('script')[0];
      firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
    }

    // API 준비 완료 대기
    window.onYouTubeIframeAPIReady = () => {
      this.apiReady = true;
      this.initializePlayers();
      this.restorePlayerState();
    };

    // 이미 API가 로드된 경우
    if (window.YT && window.YT.Player) {
      this.apiReady = true;
      this.initializePlayers();
      this.restorePlayerState();
    }

    // 언어 변경 전 상태 저장
    window.addEventListener('beforeunload', () => {
      this.savePlayerState();
    });
  }

  /**
   * 모든 YouTube iframe을 플레이어로 초기화
   */
  initializePlayers() {
    const iframes = document.querySelectorAll('.post-music iframe[src*="youtube.com/embed"]');
    
    iframes.forEach((iframe) => {
      const videoId = this.extractVideoId(iframe.src);
      if (videoId && !this.players[videoId]) {
        try {
          this.players[videoId] = new YT.Player(iframe, {
            events: {
              'onReady': (event) => this.onPlayerReady(event, videoId),
              'onStateChange': (event) => this.onPlayerStateChange(event, videoId)
            }
          });
        } catch (error) {
          console.error('Failed to initialize YouTube player:', error);
        }
      }
    });
  }

  /**
   * URL에서 비디오 ID 추출
   */
  extractVideoId(url) {
    const match = url.match(/embed\/([a-zA-Z0-9_-]{11})/);
    return match ? match[1] : null;
  }

  /**
   * 플레이어 준비 완료 핸들러
   */
  onPlayerReady(event, videoId) {
    console.log('YouTube player ready:', videoId);
  }

  /**
   * 플레이어 상태 변경 핸들러
   */
  onPlayerStateChange(event, videoId) {
    // 상태 변경 시 자동 저장 (선택 사항)
  }

  /**
   * 현재 플레이어 상태 저장
   */
  savePlayerState() {
    const states = {};
    
    Object.keys(this.players).forEach(videoId => {
      const player = this.players[videoId];
      try {
        if (player && typeof player.getCurrentTime === 'function') {
          states[videoId] = {
            currentTime: player.getCurrentTime(),
            playerState: player.getPlayerState()
          };
        }
      } catch (error) {
        console.error('Failed to save player state:', error);
      }
    });

    if (Object.keys(states).length > 0) {
      sessionStorage.setItem('youtube_player_states', JSON.stringify(states));
    }
  }

  /**
   * 저장된 플레이어 상태 복원
   */
  restorePlayerState() {
    const savedStates = sessionStorage.getItem('youtube_player_states');
    if (!savedStates) return;

    try {
      const states = JSON.parse(savedStates);
      
      // 짧은 지연 후 복원 (플레이어 초기화 대기)
      setTimeout(() => {
        Object.keys(states).forEach(videoId => {
          const player = this.players[videoId];
          const state = states[videoId];
          
          if (player && state) {
            try {
              // 시간 복원
              if (state.currentTime) {
                player.seekTo(state.currentTime, true);
              }
              
              // 재생 상태 복원
              if (state.playerState === YT.PlayerState.PLAYING) {
                player.playVideo();
              } else if (state.playerState === YT.PlayerState.PAUSED) {
                player.pauseVideo();
              }
            } catch (error) {
              console.error('Failed to restore player state:', error);
            }
          }
        });

        // 복원 후 세션 스토리지 정리
        sessionStorage.removeItem('youtube_player_states');
      }, 1000);
    } catch (error) {
      console.error('Failed to parse saved player states:', error);
    }
  }
}

// 전역 인스턴스 생성
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    window.youtubePlayerManager = new YouTubePlayerManager();
  });
} else {
  window.youtubePlayerManager = new YouTubePlayerManager();
}