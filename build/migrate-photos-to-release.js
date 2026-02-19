/**
 * 기존 photo/ 폴더의 원본 JPG를 GitHub Release asset으로 마이그레이션
 * photo_data.json의 url 필드도 Release URL로 업데이트
 *
 * 사용법:
 *   node build/migrate-photos-to-release.js --token=ghp_xxx --owner=username --repo=reponame
 *
 * 완료 후:
 *   - photo_data.json의 url 필드가 Release URL로 업데이트됨
 *   - 원본 JPG 파일은 수동으로 Git에서 제거 필요:
 *       git rm photo/*.jpg --cached (thumb_ 제외)
 *       git rm photo/photo_data.json --cached  (변경된 JSON은 다시 add)
 */

'use strict';

const fs = require('fs-extra');
const path = require('path');
const https = require('https');

// CLI 인자 파싱
const args = {};
process.argv.slice(2).forEach(arg => {
  const [key, val] = arg.replace('--', '').split('=');
  args[key] = val;
});

const TOKEN = args.token;
const OWNER = args.owner;
const REPO  = args.repo;
const RELEASE_TAG = 'photos';

if (!TOKEN || !OWNER || !REPO) {
  console.error('사용법: node build/migrate-photos-to-release.js --token=ghp_xxx --owner=USERNAME --repo=REPONAME');
  process.exit(1);
}

const ROOT = path.join(__dirname, '..');
const PHOTO_DIR = path.join(ROOT, 'photo');
const PHOTO_DATA_PATH = path.join(PHOTO_DIR, 'photo_data.json');

// fetch polyfill (Node 18 이상은 내장 fetch 사용 가능)
const fetchFn = typeof fetch !== 'undefined' ? fetch : (...args) => import('node-fetch').then(m => m.default(...args));

async function githubFetch(url, options = {}) {
  const fn = typeof fetch !== 'undefined' ? fetch : (await import('node-fetch')).default;
  const headers = {
    'Accept': 'application/vnd.github.v3+json',
    'Authorization': `token ${TOKEN}`,
    ...options.headers
  };
  return fn(url, { ...options, headers });
}

// Release 가져오기 또는 생성
async function getOrCreateRelease() {
  const res = await githubFetch(
    `https://api.github.com/repos/${OWNER}/${REPO}/releases/tags/${RELEASE_TAG}`
  );

  if (res.ok) {
    const release = await res.json();
    console.log(`✅ 기존 Release 사용: id=${release.id}`);
    return release;
  }

  console.log('📦 Release 생성 중...');
  const createRes = await githubFetch(
    `https://api.github.com/repos/${OWNER}/${REPO}/releases`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tag_name: RELEASE_TAG,
        name: 'Photo Storage',
        body: '블로그 사진 원본 저장소 (Git 저장소 용량 절약용)',
        draft: false,
        prerelease: false
      })
    }
  );

  if (!createRes.ok) {
    const err = await createRes.json();
    throw new Error(`Release 생성 실패: ${err.message}`);
  }

  const release = await createRes.json();
  console.log(`✅ Release 생성 완료: id=${release.id}`);
  return release;
}

// 기존 Release assets 목록
async function listAssets(releaseId) {
  const res = await githubFetch(
    `https://api.github.com/repos/${OWNER}/${REPO}/releases/${releaseId}/assets?per_page=100`
  );
  if (!res.ok) return [];
  return await res.json();
}

// asset 업로드
async function uploadAsset(releaseId, filename, filePath) {
  const fileBuffer = await fs.readFile(filePath);
  const fn = typeof fetch !== 'undefined' ? fetch : (await import('node-fetch')).default;

  const uploadUrl = `https://uploads.github.com/repos/${OWNER}/${REPO}/releases/${releaseId}/assets?name=${encodeURIComponent(filename)}`;
  const res = await fn(uploadUrl, {
    method: 'POST',
    headers: {
      'Accept': 'application/vnd.github.v3+json',
      'Authorization': `token ${TOKEN}`,
      'Content-Type': 'image/jpeg',
      'Content-Length': fileBuffer.length
    },
    body: fileBuffer
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(`업로드 실패 (${filename}): ${err.message}`);
  }

  const data = await res.json();
  return `https://github.com/${OWNER}/${REPO}/releases/download/${RELEASE_TAG}/${filename}`;
}

async function main() {
  console.log(`\n🚀 마이그레이션 시작: ${OWNER}/${REPO}\n`);

  // photo_data.json 로드
  const photoData = JSON.parse(await fs.readFile(PHOTO_DATA_PATH, 'utf-8'));
  console.log(`📋 총 ${photoData.length}개의 사진 항목\n`);

  // Release 준비
  const release = await getOrCreateRelease();
  const existingAssets = await listAssets(release.id);
  const existingMap = new Map(existingAssets.map(a => [a.name, a]));
  console.log(`   기존 asset: ${existingAssets.length}개\n`);

  let uploaded = 0;
  let skipped = 0;
  let failed = 0;

  for (let i = 0; i < photoData.length; i++) {
    const photo = photoData[i];
    const originalUrl = photo.url;

    // 이미 Release URL로 되어 있으면 건너뜀
    if (originalUrl.includes('/releases/download/')) {
      console.log(`[${i+1}/${photoData.length}] 이미 마이그레이션됨: ${originalUrl.split('/').pop()}`);
      skipped++;
      continue;
    }

    // 상대경로에서 파일명 추출: "./photo/filename.jpg" → "filename.jpg"
    const relPath = originalUrl.replace(/^\.\//, '');  // "photo/filename.jpg"
    const filename = path.basename(relPath);            // "filename.jpg"
    const localPath = path.join(ROOT, relPath);

    if (!await fs.pathExists(localPath)) {
      console.log(`[${i+1}/${photoData.length}] ⚠️  파일 없음: ${localPath}`);
      failed++;
      continue;
    }

    // 이미 업로드된 asset이면 URL만 업데이트
    if (existingMap.has(filename)) {
      const releaseUrl = `https://github.com/${OWNER}/${REPO}/releases/download/${RELEASE_TAG}/${filename}`;
      photoData[i].url = releaseUrl;
      console.log(`[${i+1}/${photoData.length}] ♻️  이미 존재, URL 업데이트: ${filename}`);
      skipped++;
      continue;
    }

    // 업로드
    process.stdout.write(`[${i+1}/${photoData.length}] 업로드 중: ${filename} ... `);
    try {
      const releaseUrl = await uploadAsset(release.id, filename, localPath);
      photoData[i].url = releaseUrl;
      console.log(`✅`);
      uploaded++;
      // API 레이트 리밋 방지
      await new Promise(r => setTimeout(r, 300));
    } catch (e) {
      console.log(`❌ ${e.message}`);
      failed++;
    }
  }

  // photo_data.json 저장
  await fs.writeFile(PHOTO_DATA_PATH, JSON.stringify(photoData, null, 2));
  console.log(`\n💾 photo_data.json 업데이트 완료`);

  console.log(`\n📊 결과:`);
  console.log(`   업로드: ${uploaded}개`);
  console.log(`   건너뜀: ${skipped}개`);
  console.log(`   실패:   ${failed}개`);

  console.log(`\n✅ 마이그레이션 완료!`);
  console.log(`\n다음 단계:`);
  console.log(`  1. photo_data.json 확인 후 커밋`);
  console.log(`  2. 원본 JPG를 Git에서 제거:`);
  console.log(`     git ls-files photo/ | grep -v thumb_ | grep -v photo_data.json | xargs git rm --cached`);
  console.log(`     .gitignore에 추가: photo/*.jpg (thumb_ 제외)`);
  console.log(`     echo 'photo/[0-9]*.jpg' >> .gitignore`);
  console.log(`  3. git add -A && git commit`);
}

main().catch(e => {
  console.error('\n❌ 오류:', e.message);
  process.exit(1);
});
