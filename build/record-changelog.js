/**
 * changelog 사전 기록 스크립트
 * pre-commit 훅에서 호출됨
 *
 * staged 파일을 분석하여 changelog_data.json을 커밋 전에 미리 업데이트한다.
 * - content/*.md 변경 → 일기 추가/수정 기록
 * - album/album_data.json 변경 → 앨범 추가/삭제/수정 기록 (album_summary.json 비교)
 * - photo/photo_data.json 변경 → 사진 추가/삭제 기록
 * - 그 외 파일 → blog 카테고리로 커밋 메시지 기록 (commitMsg는 훅에서 전달 불가하므로 생략)
 */

'use strict';

const fs = require('fs-extra');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');
const matter = require('gray-matter');

const ROOT = path.join(__dirname, '..');
const CHANGELOG_PATH = path.join(ROOT, 'changelog', 'changelog_data.json');
const ALBUM_DATA_PATH = path.join(ROOT, 'album', 'album_data.json');
const PHOTO_DATA_PATH = path.join(ROOT, 'photo', 'photo_data.json');

// ─── 유틸 ────────────────────────────────────────────────────────────────────

function getFileHash(filepath) {
  try {
    const content = fs.readFileSync(filepath);
    return crypto.createHash('md5').update(content).digest('hex');
  } catch (e) {
    return null;
  }
}

function toDateString(d) {
  const today = new Date().toISOString().split('T')[0];
  if (!d) return today;
  const str = String(d);
  const isoMatch = str.match(/^(\d{4}-\d{2}-\d{2})/);
  if (isoMatch) return isoMatch[1];
  try {
    const dateObj = new Date(d);
    if (!isNaN(dateObj.getTime())) return dateObj.toISOString().split('T')[0];
  } catch (e) {}
  return today;
}

function extractTitle(title, fallback = '') {
  if (!title) return fallback;
  if (typeof title === 'string') return title;
  if (typeof title === 'object' && !Array.isArray(title)) {
    return title.ko || title.ja || Object.values(title)[0] || fallback;
  }
  if (Array.isArray(title)) return title[0] || fallback;
  return String(title);
}

function extractLanguageTitle(title, lang, fallback = '') {
  if (!title) return fallback;
  if (typeof title === 'string') return title;
  if (typeof title === 'object' && !Array.isArray(title)) return title[lang] || fallback;
  if (Array.isArray(title)) return title[0] || fallback;
  return fallback;
}

// ─── 메인 ────────────────────────────────────────────────────────────────────

async function main() {
  const today = new Date().toISOString().split('T')[0];

  // changelog_data.json 로드
  await fs.ensureDir(path.join(ROOT, 'changelog'));
  let changelogData = { entries: [] };
  try {
    if (await fs.pathExists(CHANGELOG_PATH)) {
      changelogData = JSON.parse(await fs.readFile(CHANGELOG_PATH, 'utf-8'));
    }
  } catch (e) {
    console.log('⚠️  changelog_data.json 로드 실패, 새로 생성');
  }

  // 중복 체크
  function isDuplicate(date, category, descKo) {
    return changelogData.entries.some(e =>
      e.date === date &&
      e.category === category &&
      (typeof e.description === 'object' ? e.description.ko : e.description) === descKo
    );
  }

  let newEntries = 0;
  let idBase = Date.now();

  function pushEntry(entry) {
    changelogData.entries.push({ id: idBase + newEntries, ...entry });
    newEntries++;
  }

  // staged 파일 목록 조회
  let stagedFiles = [];
  try {
    const out = execSync('git diff --cached --name-only', {
      cwd: ROOT, encoding: 'utf-8', timeout: 10000
    }).trim();
    stagedFiles = out ? out.split('\n').map(f => f.trim()).filter(Boolean) : [];
  } catch (e) {
    console.error('❌ staged 파일 조회 실패:', e.message);
    process.exit(1);
  }

  if (stagedFiles.length === 0) {
    // staging이 비어있으면 아무것도 하지 않음
    process.exit(0);
  }

  // staged 파일에서 Added 파일 목록 (신규 추가)
  let addedFiles = new Set();
  try {
    const out = execSync('git diff --cached --name-only --diff-filter=A', {
      cwd: ROOT, encoding: 'utf-8', timeout: 10000
    }).trim();
    if (out) out.split('\n').map(f => f.trim()).filter(Boolean).forEach(f => addedFiles.add(f));
  } catch (e) {}

  // ── 1. content/*.md 변경 → 일기 ─────────────────────────────────────────
  const contentFiles = stagedFiles.filter(f => f.startsWith('content/') && f.endsWith('.md'));
  for (const contentFile of contentFiles) {
    try {
      const filePath = path.join(ROOT, contentFile);
      let titleKo = '';
      let titleJa = '';
      let postDate = today;

      if (await fs.pathExists(filePath)) {
        const fileContent = await fs.readFile(filePath, 'utf-8');
        const { data: fm } = matter(fileContent);
        if (fm.date) postDate = toDateString(fm.date);
        titleKo = extractLanguageTitle(fm.title, 'ko', extractTitle(fm.title, ''));
        titleJa = extractLanguageTitle(fm.title, 'ja', titleKo) || titleKo;
      }

      const isNew = addedFiles.has(contentFile);
      const slug = path.basename(contentFile, '.md');
      const displayTitle = titleKo || slug;
      const displayTitleJa = titleJa || displayTitle;

      // 일기 자체 날짜를 YY/MM/DD 형식으로 설명에 포함
      const postDateShort = postDate.replace(/^(\d{4})-(\d{2})-(\d{2})$/, (_, y, m, d) =>
        `${y.slice(2)}/${m}/${d}`
      );
      const descKo = isNew
        ? `추가: [${postDateShort}] ${displayTitle}`
        : `수정: [${postDateShort}] ${displayTitle}`;
      const descJa = isNew
        ? `追加: [${postDateShort}] ${displayTitleJa}`
        : `修正: [${postDateShort}] ${displayTitleJa}`;

      if (!isDuplicate(today, 'diary', descKo)) {
        pushEntry({ date: today, category: 'diary', slug, description: { ko: descKo, ja: descJa } });
      }
    } catch (e) {
      console.log(`⚠️  ${contentFile} 처리 실패:`, e.message);
    }
  }

  // ── 2. album/album_data.json 변경 → 앨범 ───────────────────────────────
  const albumChanged = stagedFiles.includes('album/album_data.json');
  if (albumChanged && await fs.pathExists(ALBUM_DATA_PATH)) {
    try {
      const albumData = JSON.parse(await fs.readFile(ALBUM_DATA_PATH, 'utf-8'));
      const newCells = albumData.cells || [];

      // 이전 album_data 로드 (git show HEAD)
      let oldSummary = [];
      try {
        const oldRaw = execSync('git show HEAD:album/album_data.json', {
          cwd: ROOT, encoding: 'utf-8', timeout: 5000
        });
        const oldData = JSON.parse(oldRaw);
        oldSummary = oldData.cells || [];
      } catch (e) {
        // HEAD에 파일이 없으면 최초 추가 → 전체가 신규
      }

      const albumKey = c => `${c.artist}||${c.album}`;
      const summaryFields = c => ({
        key: albumKey(c), artist: c.artist, album: c.album,
        favTrack: c.favTrack, rating: c.rating,
        category: c.category, duration: c.duration, spotifyLink: c.spotifyLink
      });

      const oldMap = new Map(oldSummary.map(c => [c.key || albumKey(c), c]));
      const newMap = new Map(newCells.map(c => [albumKey(c), summaryFields(c)]));

      // 앨범 추가
      for (const [key, cell] of newMap) {
        if (!oldMap.has(key)) {
          const descKo = `앨범 추가: ${cell.artist} - ${cell.album}`;
          const descJa = `アルバム追加: ${cell.artist} - ${cell.album}`;
          if (!isDuplicate(today, 'music', descKo)) {
            pushEntry({ date: today, category: 'music', description: { ko: descKo, ja: descJa } });
          }
        }
      }

      // 앨범 삭제
      for (const [key, cell] of oldMap) {
        if (!newMap.has(key)) {
          const descKo = `앨범 삭제: ${cell.artist} - ${cell.album}`;
          const descJa = `アルバム削除: ${cell.artist} - ${cell.album}`;
          if (!isDuplicate(today, 'music', descKo)) {
            pushEntry({ date: today, category: 'music', description: { ko: descKo, ja: descJa } });
          }
        }
      }


} catch (e) {
      console.log('⚠️  앨범 데이터 처리 실패:', e.message);
    }
  }

  // ── 3. photo/photo_data.json 변경 → 사진 ──────────────────────────────
  const photoChanged = stagedFiles.includes('photo/photo_data.json');
  if (photoChanged && await fs.pathExists(PHOTO_DATA_PATH)) {
    try {
      const photoData = JSON.parse(await fs.readFile(PHOTO_DATA_PATH, 'utf-8'));
      const newPhotos = Array.isArray(photoData) ? photoData : [];

      // 이전 사진 목록: changelog_data에서 photo 항목으로 추정하지 않고
      // git show HEAD:photo/photo_data.json 으로 이전 상태를 가져옴
      let oldPhotos = [];
      try {
        const oldRaw = execSync('git show HEAD:photo/photo_data.json', {
          cwd: ROOT, encoding: 'utf-8', timeout: 5000
        });
        oldPhotos = JSON.parse(oldRaw);
        if (!Array.isArray(oldPhotos)) oldPhotos = [];
      } catch (e) {
        // HEAD에 파일이 없으면 최초 추가 → 전체가 신규
      }

      const oldMap = new Map(oldPhotos.map(p => [p.id, { id: p.id, camera: p.camera }]));
      const newMap = new Map(newPhotos.map(p => [p.id, { id: p.id, camera: p.camera }]));

      // 사진 추가
      for (const [id, photo] of newMap) {
        if (!oldMap.has(id)) {
          const cameraStr = photo.camera ? ` (${photo.camera})` : '';
          const descKo = `사진 추가: ID ${id}${cameraStr}`;
          const descJa = `写真追加: ID ${id}${cameraStr}`;
          if (!isDuplicate(today, 'photo', descKo)) {
            pushEntry({ date: today, category: 'photo', description: { ko: descKo, ja: descJa } });
          }
        }
      }

      // 사진 삭제
      for (const [id] of oldMap) {
        if (!newMap.has(id)) {
          const descKo = `사진 삭제: ID ${id}`;
          const descJa = `写真削除: ID ${id}`;
          if (!isDuplicate(today, 'photo', descKo)) {
            pushEntry({ date: today, category: 'photo', description: { ko: descKo, ja: descJa } });
          }
        }
      }
    } catch (e) {
      console.log('⚠️  사진 데이터 처리 실패:', e.message);
    }
  }

  // ── 4. blog 파일 변경 감지 → commit-msg 훅에서 처리하도록 플래그 저장 ──
  const blogFiles = stagedFiles.filter(f =>
    f.startsWith('templates/') || f.startsWith('build/') ||
    f.startsWith('static/') || f.startsWith('admin/') ||
    f.startsWith('.github/') ||
    f === 'config.json' || f === 'package.json'
  );
  // changelog_data.json 자체 변경은 blog로 취급하지 않음
  const isBlogOnly = blogFiles.length > 0 &&
    contentFiles.length === 0 && !albumChanged && !photoChanged;
  const hasBlogAmong = blogFiles.length > 0;

  if (hasBlogAmong) {
    // commit-msg 훅이 읽을 플래그 파일 생성 (.git/ 폴더 안에)
    const flagPath = path.join(ROOT, '.git', 'CHANGELOG_BLOG_PENDING');
    await fs.writeFile(flagPath, 'blog');
  }

  // ── 저장 ────────────────────────────────────────────────────────────────
  if (newEntries > 0) {
    // 날짜 오름차순 정렬
    changelogData.entries.sort((a, b) => {
      const dateCmp = a.date.localeCompare(b.date);
      return dateCmp !== 0 ? dateCmp : a.id - b.id;
    });

    await fs.writeFile(CHANGELOG_PATH, JSON.stringify(changelogData, null, 2));
    console.log(`📋 변경사항 ${newEntries}건 changelog_data.json에 기록`);

    // changelog_data.json을 staging에 추가
    execSync('git add changelog/changelog_data.json', { cwd: ROOT });
    console.log('   → changelog_data.json staging 추가 완료');
  }
}

main().catch(e => {
  console.error('❌ record-changelog 실패:', e.message);
  process.exit(1);
});
