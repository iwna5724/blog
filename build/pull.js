/**
 * GitHub Actions 완료 대기 후 git pull 스크립트
 * npm run pull 에서 호출됨 (push 없이 대기만)
 *
 * 1. main 브랜치에서 진행 중인 Actions 실행 확인
 * 2. 모든 실행이 완료되면 git pull --rebase
 */

'use strict';

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const https = require('https');

const ROOT = path.join(__dirname, '..');
const CONFIG_PATH = path.join(ROOT, 'config.json');

const POLL_INTERVAL_MS = 5000;    // 5초마다 폴링
const TIMEOUT_MS = 10 * 60 * 1000; // 최대 10분 대기

function request(url, token) {
  return new Promise((resolve, reject) => {
    const opts = {
      headers: {
        'Authorization': `token ${token}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'blog-pull'
      }
    };
    https.get(url, opts, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error('JSON parse error: ' + data.substring(0, 200))); }
      });
    }).on('error', reject);
  });
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function pullAndBuild(cwd) {
  try {
    execSync('git pull --rebase', { cwd, stdio: 'inherit' });
    console.log('✅ pull 완료. 빌드 실행 중...');
    try {
      execSync('node build/build.js', { cwd, stdio: 'inherit' });
      console.log('✅ 빌드 완료. 로컬이 최신 상태입니다.');
    } catch (buildErr) {
      console.error('❌ 빌드 실패:', buildErr.message);
      console.error('   수동으로 npm run build 를 실행해주세요.');
    }
  } catch (pullErr) {
    console.error('❌ git pull 실패:', pullErr.message);
    console.error('   수동으로 git pull --rebase 를 실행해주세요.');
  }
}

async function main() {
  // config.json에서 owner/repo 읽기
  let owner, repo;
  try {
    const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
    owner = config.github.owner;
    repo = config.github.repo;
  } catch (e) {
    console.error('❌ config.json 읽기 실패:', e.message);
    process.exit(1);
  }

  // GitHub 토큰 읽기
  let token = process.env.GITHUB_TOKEN || '';
  if (!token) {
    try {
      token = execSync('git config --global github.token', {
        encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore']
      }).trim();
    } catch (e) {}
  }
  if (!token) {
    try {
      const remoteUrl = execSync('git remote get-url origin', { encoding: 'utf-8' }).trim();
      const match = remoteUrl.match(/https:\/\/([^@]+)@/);
      if (match) token = match[1];
    } catch (e) {}
  }

  if (!token) {
    console.warn('⚠️  GitHub 토큰을 찾을 수 없습니다.');
    console.warn('   GITHUB_TOKEN 환경변수를 설정하거나, git config --global github.token <token> 으로 설정해주세요.');
    process.exit(1);
  }

  const apiBase = `https://api.github.com/repos/${owner}/${repo}`;

  // 진행 중인 Actions가 있는지 먼저 확인
  console.log('🔍 진행 중인 Actions 확인 중...');
  let hasActiveRuns = false;
  try {
    const runs = await request(
      `${apiBase}/actions/runs?branch=main&status=in_progress&per_page=10`,
      token
    );
    const queued = await request(
      `${apiBase}/actions/runs?branch=main&status=queued&per_page=10`,
      token
    );
    const total = (runs.total_count || 0) + (queued.total_count || 0);
    hasActiveRuns = total > 0;
    if (hasActiveRuns) {
      console.log(`⏳ 진행 중인 Actions ${total}건 감지. 완료될 때까지 대기합니다...`);
    }
  } catch (e) {
    console.warn('⚠️  Actions 상태 확인 실패:', e.message);
  }

  if (!hasActiveRuns) {
    console.log('✅ 진행 중인 Actions 없음. git pull 실행 중...');
    pullAndBuild(ROOT);
    process.exit(0);
  }

  // 진행 중인 Actions가 모두 끝날 때까지 폴링
  const startTime = Date.now();

  while (Date.now() - startTime < TIMEOUT_MS) {
    await sleep(POLL_INTERVAL_MS);

    try {
      const [inProgress, queued] = await Promise.all([
        request(`${apiBase}/actions/runs?branch=main&status=in_progress&per_page=10`, token),
        request(`${apiBase}/actions/runs?branch=main&status=queued&per_page=10`, token),
      ]);

      const activeCount = (inProgress.total_count || 0) + (queued.total_count || 0);

      if (activeCount === 0) {
        console.log('');
        console.log('✅ 모든 Actions 완료! git pull 실행 중...');
        pullAndBuild(ROOT);
        process.exit(0);
      } else {
        process.stdout.write('.');
      }
    } catch (e) {
      process.stdout.write('?');
    }
  }

  console.log('');
  console.log('⏰ 10분이 지나도 Actions가 완료되지 않았습니다.');
  console.log('   GitHub Actions 탭을 확인하고, 완료 후 수동으로 git pull 해주세요.');
  process.exit(0);
}

main().catch(e => {
  console.error('❌ pull 실패:', e.message);
  process.exit(1);
});
