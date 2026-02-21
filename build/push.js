/**
 * GitHub Actions 완료 대기 후 git pull 스크립트
 * npm run push 에서 git push 후 호출됨
 *
 * 1. 현재 HEAD 커밋 해시 확인
 * 2. GitHub Actions API 폴링 (Build and Deploy Blog 워크플로우)
 * 3. 해당 커밋의 Actions 실행이 완료되면 git pull --rebase
 */

'use strict';

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const https = require('https');

const ROOT = path.join(__dirname, '..');
const CONFIG_PATH = path.join(ROOT, 'config.json');

const POLL_INTERVAL_MS = 5000;   // 5초마다 폴링
const TIMEOUT_MS = 10 * 60 * 1000; // 최대 10분 대기

function request(url, token) {
  return new Promise((resolve, reject) => {
    const opts = {
      headers: {
        'Authorization': `token ${token}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'blog-push'
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

  // GitHub 토큰 읽기 (git credential에서 추출)
  let token = process.env.GITHUB_TOKEN || '';
  if (!token) {
    try {
      // git config에서 토큰 추출 시도
      token = execSync('git config --global github.token', {
        encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore']
      }).trim();
    } catch (e) {}
  }
  if (!token) {
    try {
      // Windows credential manager / .netrc 등에서 추출
      const remoteUrl = execSync('git remote get-url origin', { encoding: 'utf-8' }).trim();
      const match = remoteUrl.match(/https:\/\/([^@]+)@/);
      if (match) token = match[1];
    } catch (e) {}
  }

  if (!token) {
    console.warn('⚠️  GitHub 토큰을 찾을 수 없습니다.');
    console.warn('   GITHUB_TOKEN 환경변수를 설정하거나, git config --global github.token <token> 으로 설정해주세요.');
    console.warn('   Actions 완료 대기를 건너뜁니다. 나중에 수동으로 git pull 해주세요.');
    process.exit(0);
  }

  // push된 커밋 해시 (amend 후 최종 로컬 HEAD)
  let commitSha;
  try {
    commitSha = execSync('git rev-parse HEAD', { cwd: ROOT, encoding: 'utf-8' }).trim();
  } catch (e) {
    console.error('❌ HEAD 커밋 해시 읽기 실패:', e.message);
    process.exit(1);
  }

  console.log(`⏳ Actions 완료 대기 중... (커밋: ${commitSha.substring(0, 7)})`);
  console.log('   Build and Deploy Blog 워크플로우가 완료되면 자동으로 pull합니다.');

  const startTime = Date.now();
  const apiBase = `https://api.github.com/repos/${owner}/${repo}`;

  while (Date.now() - startTime < TIMEOUT_MS) {
    await sleep(POLL_INTERVAL_MS);

    try {
      // 해당 커밋의 Actions 실행 목록 조회
      const runs = await request(
        `${apiBase}/actions/workflows/deploy.yml/runs?head_sha=${commitSha}&per_page=5`,
        token
      );

      if (!runs.workflow_runs || runs.workflow_runs.length === 0) {
        process.stdout.write('.');
        continue;
      }

      const run = runs.workflow_runs[0];
      const status = run.status;
      const conclusion = run.conclusion;

      if (status === 'completed') {
        console.log('');
        if (conclusion === 'success') {
          console.log('✅ Actions 완료! git pull 실행 중...');
          try {
            execSync('git pull --rebase', { cwd: ROOT, stdio: 'inherit' });
            console.log('✅ pull 완료. 로컬이 최신 상태입니다.');
          } catch (pullErr) {
            console.error('❌ git pull 실패:', pullErr.message);
            console.error('   수동으로 git pull --rebase 를 실행해주세요.');
          }
        } else {
          console.log(`⚠️  Actions가 ${conclusion}으로 종료되었습니다.`);
          console.log('   GitHub Actions 탭에서 로그를 확인해주세요.');
        }
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
  console.error('❌ push 실패:', e.message);
  process.exit(0);
});
